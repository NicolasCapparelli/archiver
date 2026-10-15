//! Explicit delivery to a captured destination. Never synthesize Enter or retry input.
use crate::store::Result;
use serde::Serialize;
use std::{
    mem::size_of,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    System::Threading::GetCurrentProcessId,
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub window: usize,
    pub focus: usize,
    pub pid: u32,
    pub thread: u32,
}
pub type Destination = Arc<Mutex<Option<Target>>>;
impl Target {
    pub fn current() -> Option<Self> {
        unsafe {
            let window = GetForegroundWindow();
            if window.is_null() {
                return None;
            }
            let mut pid = 0;
            let thread = GetWindowThreadProcessId(window, &mut pid);
            let mut info: GUITHREADINFO = std::mem::zeroed();
            info.cbSize = size_of::<GUITHREADINFO>() as u32;
            if GetGUIThreadInfo(thread, &mut info) == 0 || info.hwndFocus.is_null() {
                return None;
            }
            Some(Self {
                window: window as usize,
                focus: info.hwndFocus as usize,
                pid,
                thread,
            })
        }
    }
    pub fn valid(self) -> bool {
        unsafe {
            let mut pid = 0;
            IsWindow(self.window as _) != 0
                && IsWindow(self.focus as _) != 0
                && GetWindowThreadProcessId(self.window as _, &mut pid) == self.thread
                && pid == self.pid
                && GetAncestor(self.focus as _, GA_ROOT) == self.window as _
        }
    }
    pub fn focused(self) -> bool {
        Self::current() == Some(self)
    }
    pub fn restore_focus(self) -> Result<()> {
        if !self.valid() {
            return Err("The destination was closed or replaced. Open quick access from the intended app again.".into());
        }
        unsafe {
            if IsIconic(self.window as _) != 0 {
                ShowWindow(self.window as _, SW_RESTORE);
            }
            SetForegroundWindow(self.window as _);
        }
        let start = Instant::now();
        while start.elapsed() < Duration::from_millis(400) {
            if self.focused() {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        Err("Windows did not restore the original focused control. Nothing was pasted; try opening quick access from that app again.".into())
    }
}
pub fn remember(destination: &Destination) {
    if let Some(target) = Target::current() {
        if target.pid != unsafe { GetCurrentProcessId() } {
            if let Ok(mut saved) = destination.lock() {
                *saved = Some(target);
            }
        }
    }
}
pub fn track(destination: Destination) {
    std::thread::spawn(move || loop {
        remember(&destination);
        std::thread::sleep(Duration::from_millis(80));
    });
}
pub fn wait_release() -> Result<()> {
    let start = Instant::now();
    while [
        VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN, VK_RETURN, VK_LBUTTON,
    ]
    .into_iter()
    .any(|key| unsafe { GetAsyncKeyState(i32::from(key)) } < 0)
    {
        if start.elapsed() > Duration::from_secs(2) {
            return Err("Release the shortcut keys or mouse button, then try again.".into());
        }
        std::thread::sleep(Duration::from_millis(8));
    }
    Ok(())
}
pub fn chord_inputs(keys: &[u16]) -> Vec<INPUT> {
    keys.iter()
        .copied()
        .map(|key| (key, false))
        .chain(keys.iter().rev().copied().map(|key| (key, true)))
        .map(|(key, up)| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        })
        .collect()
}
pub fn send_chord(target: Target, keys: &[u16]) -> Result<()> {
    if !target.focused() {
        return Err("Focus changed before delivery. Nothing was sent.".into());
    }
    let inputs = chord_inputs(keys);
    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            size_of::<INPUT>() as i32,
        )
    };
    if sent as usize != inputs.len() {
        let releases = &inputs[keys.len()..];
        unsafe {
            SendInput(
                releases.len() as u32,
                releases.as_ptr(),
                size_of::<INPUT>() as i32,
            );
        }
        return Err("Windows blocked or only partially accepted delivery (possibly an elevated destination). No automatic retry was attempted.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paste_chord_balances_keys_without_submitting() {
        let inputs = chord_inputs(&[VK_CONTROL, 0x56]);
        let keys: Vec<_> = inputs
            .iter()
            .map(|i| unsafe { (i.Anonymous.ki.wVk, i.Anonymous.ki.dwFlags) })
            .collect();
        assert_eq!(
            keys,
            [
                (VK_CONTROL, 0),
                (0x56, 0),
                (0x56, KEYEVENTF_KEYUP),
                (VK_CONTROL, KEYEVENTF_KEYUP)
            ]
        );
        assert!(keys.iter().all(|(key, _)| *key != VK_RETURN));
    }
    #[test]
    fn stale_destination_is_rejected_before_focus_or_input() {
        let target = Target {
            window: 0,
            focus: 0,
            pid: 0,
            thread: 0,
        };
        assert!(!target.valid());
        assert!(target.restore_focus().is_err());
        assert!(send_chord(target, &[VK_CONTROL, 0x56]).is_err());
    }
}
