//! Windows clipboard capture. Only formats with known global-memory ownership are serialized.
use crate::settings::Settings;
use crate::store::{Capture, Representation, Result};
use std::{
    cell::{Cell, RefCell},
    ptr::null_mut,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::SyncSender,
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use windows_sys::Win32::{
    Foundation::*,
    System::{DataExchange::*, LibraryLoader::GetModuleHandleW, Memory::*, Threading::*},
    UI::{Shell::DragQueryFileW, WindowsAndMessaging::*},
};

struct Context {
    sender: SyncSender<Capture>,
    paused: Arc<AtomicBool>,
    health: Arc<Mutex<String>>,
    error: Arc<Mutex<Option<String>>>,
    settings: Arc<Mutex<Settings>>,
    sequence: Cell<u32>,
}
thread_local! { static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) }; }
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn issue(context: &Context, message: String) {
    if let Ok(mut error) = context.error.lock() {
        *error = Some(message);
    }
}
pub fn start(
    sender: SyncSender<Capture>,
    paused: Arc<AtomicBool>,
    health: Arc<Mutex<String>>,
    error: Arc<Mutex<Option<String>>>,
    settings: Arc<Mutex<Settings>>,
) {
    std::thread::spawn(move || unsafe {
        CONTEXT.with(|c| {
            *c.borrow_mut() = Some(Context {
                sender,
                paused,
                health,
                error,
                settings,
                sequence: Cell::new(0),
            })
        });
        let name = wide("ArchiverClipboardListener");
        let instance = GetModuleHandleW(std::ptr::null());
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            lpszClassName: name.as_ptr(),
            ..std::mem::zeroed()
        };
        if RegisterClassW(&class) == 0 {
            report_failure("Could not register clipboard listener");
            return;
        }
        let hwnd = CreateWindowExW(
            0,
            name.as_ptr(),
            name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            null_mut(),
            instance,
            std::ptr::null(),
        );
        if hwnd.is_null() || AddClipboardFormatListener(hwnd) == 0 {
            report_failure("Could not subscribe to clipboard updates");
            return;
        }
        CONTEXT.with(|c| {
            if let Some(context) = c.borrow().as_ref() {
                if let Ok(mut h) = context.health.lock() {
                    *h = "Listening".into();
                }
            }
        });
        let mut message: MSG = std::mem::zeroed();
        while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    });
}
fn report_failure(message: &str) {
    CONTEXT.with(|c| {
        if let Some(context) = c.borrow().as_ref() {
            if let Ok(mut h) = context.health.lock() {
                *h = "Unavailable".into();
            }
            issue(context, message.into());
        }
    });
}
unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_CLIPBOARDUPDATE {
        CONTEXT.with(|c|{
            let borrow=c.borrow();let Some(context)=borrow.as_ref() else{return;};
            if context.paused.load(Ordering::Relaxed){return;}
            let sequence=GetClipboardSequenceNumber();
            if sequence != 0 && sequence == context.sequence.get() { return; }
            match read(hwnd,context) {
                Ok((Some(capture),warning))=>{
                    if let Some(warning)=warning{issue(context,warning);}
                    if let Err(e)=context.sender.try_send(capture){issue(context,format!("Capture backlog full or disconnected; clipboard event not saved: {e}"));}
                },
                Ok((None,Some(warning)))=>issue(context,warning),
                Ok(_)=>{},Err(e)=>issue(context,e)
            }
        });
        return 0;
    }
    DefWindowProcW(hwnd, message, wparam, lparam)
}
struct ClipboardGuard;
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            CloseClipboard();
        }
    }
}
unsafe fn open(hwnd: HWND) -> Result<ClipboardGuard> {
    for attempt in 0..5 {
        if OpenClipboard(hwnd) != 0 {
            return Ok(ClipboardGuard);
        }
        if attempt < 4 {
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    Err("Clipboard is busy; capture or copy could not complete".into())
}
fn format_name(format: u32) -> String {
    match format {
        1 => "CF_TEXT".into(),
        7 => "CF_OEMTEXT".into(),
        8 => "CF_DIB".into(),
        13 => "CF_UNICODETEXT".into(),
        15 => "CF_HDROP".into(),
        17 => "CF_DIBV5".into(),
        _ => unsafe {
            let mut buffer = [0u16; 256];
            let n = GetClipboardFormatNameW(format, buffer.as_mut_ptr(), 256);
            if n > 0 {
                String::from_utf16_lossy(&buffer[..n as usize])
            } else {
                format!("Native format {format}")
            }
        },
    }
}
fn known_memory_format(format: u32, name: &str) -> bool {
    matches!(format, 1 | 7 | 8 | 13 | 15 | 17)
        || matches!(
            name,
            "HTML Format"
                | "Rich Text Format"
                | "Rich Text Format Without Objects"
                | "PNG"
                | "image/png"
                | "JFIF"
        )
}
fn trim_text_allocation(format: u32, bytes: &mut Vec<u8>) {
    if format == 13 {
        if let Some(end) = bytes.chunks_exact(2).position(|unit| unit == [0, 0]) {
            bytes.truncate((end + 1) * 2);
        }
    } else if matches!(format, 1 | 7) {
        if let Some(end) = bytes.iter().position(|byte| *byte == 0) {
            bytes.truncate(end + 1);
        }
    }
}
unsafe fn read(hwnd: HWND, context: &Context) -> Result<(Option<Capture>, Option<String>)> {
    let timestamp = now();
    let mut reps = vec![];
    let mut unsupported = vec![];
    let mut text = String::new();
    let mut files = vec![];
    let source;
    {
        let _guard = open(hwnd)?;
        // Attribute the locked snapshot, rather than an owner observed before retries.
        let owner = GetClipboardOwner();
        let mut pid = 0;
        if !owner.is_null() {
            GetWindowThreadProcessId(owner, &mut pid);
        }
        source = process_name(pid);
        let excluded = context
            .settings
            .lock()
            .map_err(|_| "Capture settings unavailable")?
            .excludes(&source);
        if pid == GetCurrentProcessId() || excluded || context.paused.load(Ordering::Relaxed) {
            context.sequence.set(GetClipboardSequenceNumber());
            return Ok((None, None));
        }
        // Snapshot format IDs before requesting data, which can synthesize formats.
        let mut formats = vec![];
        let mut format = EnumClipboardFormats(0);
        while format != 0 {
            formats.push(format);
            format = EnumClipboardFormats(format);
        }
        for format in formats {
            let name = format_name(format);
            if known_memory_format(format, &name) {
                let handle = GetClipboardData(format);
                let size = GlobalSize(handle);
                if !handle.is_null() && size > 0 {
                    // Never dereference an arbitrary custom-format handle. Known formats are HGLOBAL.
                    let pointer = GlobalLock(handle);
                    if !pointer.is_null() {
                        let mut bytes =
                            std::slice::from_raw_parts(pointer.cast::<u8>(), size).to_vec();
                        GlobalUnlock(handle);
                        // Allocation padding is not text and must not change content identity.
                        trim_text_allocation(format, &mut bytes);
                        if format == 13 {
                            let units: Vec<u16> = bytes
                                .chunks_exact(2)
                                .map(|p| u16::from_le_bytes([p[0], p[1]]))
                                .take_while(|v| *v != 0)
                                .collect();
                            text = String::from_utf16_lossy(&units);
                        }
                        if format == 15 {
                            let count = DragQueryFileW(handle, 0xffffffff, null_mut(), 0);
                            for index in 0..count {
                                let n = DragQueryFileW(handle, index, null_mut(), 0);
                                let mut path = vec![0u16; n as usize + 1];
                                DragQueryFileW(handle, index, path.as_mut_ptr(), n + 1);
                                files.push(String::from_utf16_lossy(&path[..n as usize]));
                            }
                        }
                        reps.push(Representation {
                            format: name,
                            data: bytes,
                        });
                    } else {
                        unsupported.push(name);
                    }
                } else {
                    unsupported.push(name);
                }
            } else if !matches!(
                name.as_str(),
                "ExcludeClipboardContentFromMonitorProcessing"
                    | "CanIncludeInClipboardHistory"
                    | "CanUploadToCloudClipboard"
            ) {
                unsupported.push(name);
            }
        }
        // Delayed rendering may advance the sequence while we read. Absorb the
        // resulting queued notifications without counting a second copy.
        context.sequence.set(GetClipboardSequenceNumber());
    }
    let warning = if unsupported.is_empty() {
        None
    } else {
        Some(format!(
            "Clipboard formats not yet captured: {}",
            unsupported.join(", ")
        ))
    };
    if reps.is_empty() {
        return Ok((None, warning));
    }
    let kind = if !files.is_empty() {
        text = files.join("\n");
        "files"
    } else if reps.iter().any(|r| {
        matches!(
            r.format.as_str(),
            "PNG" | "image/png" | "CF_DIB" | "CF_DIBV5" | "JFIF"
        )
    }) {
        "image"
    } else if reps
        .iter()
        .any(|r| r.format == "HTML Format" || r.format.starts_with("Rich Text"))
    {
        "rich"
    } else {
        "text"
    };
    Ok((
        Some(Capture {
            kind: kind.into(),
            text,
            source,
            timestamp,
            directory: String::new(),
            session: String::new(),
            sequence: None,
            representations: reps,
        }),
        warning,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn text_identity_ignores_allocator_padding_but_preserves_binary_payloads() {
        let mut unicode = vec![0x41, 0, 0x42, 0, 0, 0, 0xff, 0xff];
        trim_text_allocation(13, &mut unicode);
        assert_eq!(unicode, vec![0x41, 0, 0x42, 0, 0, 0]);
        for format in [1, 7] {
            let mut ansi = vec![65, 0, 99];
            trim_text_allocation(format, &mut ansi);
            assert_eq!(ansi, vec![65, 0]);
        }
        let mut image = vec![65, 0, 99];
        trim_text_allocation(8, &mut image);
        assert_eq!(image, vec![65, 0, 99]);
    }
}
pub unsafe fn process_name(pid: u32) -> String {
    if pid == 0 {
        return "Unknown source".into();
    }
    let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if process.is_null() {
        return "Unknown source".into();
    }
    let mut buffer = vec![0u16; 32768];
    let mut n = buffer.len() as u32;
    let success = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut n);
    CloseHandle(process);
    if success == 0 {
        return "Unknown source".into();
    }
    let path = String::from_utf16_lossy(&buffer[..n as usize]);
    std::path::Path::new(&path)
        .file_name()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or(path)
}
pub fn restore(hwnd: HWND, reps: &[Representation], text: &str, plain: bool) -> Result<()> {
    unsafe {
        // Prepare allocations before clearing the clipboard. Successful SetClipboardData transfers ownership.
        let mut payloads: Vec<(u32, Vec<u8>)> = vec![];
        if !plain {
            for rep in reps {
                let format = match rep.format.as_str() {
                    "CF_TEXT" => 1,
                    "CF_OEMTEXT" => 7,
                    "CF_DIB" => 8,
                    "CF_UNICODETEXT" => 13,
                    "CF_HDROP" => 15,
                    "CF_DIBV5" => 17,
                    name => RegisterClipboardFormatW(wide(name).as_ptr()),
                };
                if format == 0 {
                    return Err("Could not register replay format".into());
                }
                payloads.push((format, rep.data.clone()));
            }
        }
        if plain || payloads.is_empty() {
            payloads = vec![(
                13,
                wide(text).iter().flat_map(|c| c.to_le_bytes()).collect(),
            )];
        }
        let mut allocations = vec![];
        for (format, data) in payloads {
            let handle = GlobalAlloc(GMEM_MOVEABLE, data.len());
            let ptr = GlobalLock(handle);
            if ptr.is_null() {
                if !handle.is_null() {
                    GlobalFree(handle);
                }
                for (_, h) in allocations {
                    GlobalFree(h);
                }
                return Err("Could not allocate clipboard payload".into());
            }
            std::ptr::copy_nonoverlapping(data.as_ptr(), ptr.cast(), data.len());
            GlobalUnlock(handle);
            allocations.push((format, handle));
        }
        let guard = match open(hwnd) {
            Ok(g) => g,
            Err(e) => {
                for (_, h) in allocations {
                    GlobalFree(h);
                }
                return Err(e);
            }
        };
        if EmptyClipboard() == 0 {
            for (_, h) in allocations {
                GlobalFree(h);
            }
            return Err("Could not empty clipboard".into());
        }
        let mut failed = false;
        for (format, handle) in allocations {
            if SetClipboardData(format, handle).is_null() {
                GlobalFree(handle);
                failed = true;
            }
        }
        drop(guard);
        if failed {
            return Err("Some clipboard representations could not be restored".into());
        }
        Ok(())
    }
}
