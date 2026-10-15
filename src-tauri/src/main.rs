#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use archiver_core::settings::Settings;
use archiver_core::store::{Capture, Item, Stats, Store};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct State {
    store: Arc<Mutex<Store>>,
    paused: Arc<AtomicBool>,
    health: Arc<Mutex<String>>,
    error: Arc<Mutex<Option<String>>>,
    shells: Arc<Mutex<BTreeSet<String>>>,
    data_path: PathBuf,
    settings: Arc<Mutex<Settings>>,
    #[cfg(windows)]
    destination: archiver_core::delivery::Destination,
    inserting: Arc<AtomicBool>,
    preview_worker: Arc<Mutex<()>>,
    ocr_running: Arc<AtomicBool>,
    ocr_cancel: Arc<AtomicBool>,
    ocr_error: Arc<Mutex<Option<String>>>,
    update: Mutex<Option<tauri_plugin_updater::Update>>,
}
#[tauri::command]
fn ocr_status(state: tauri::State<State>) -> Result<serde_json::Value, String> {
    let mut counts = lock(&state.store)?.ocr_counts()?;
    counts["running"] = state.ocr_running.load(Ordering::SeqCst).into();
    counts["error"] =
        serde_json::to_value(lock(&state.ocr_error)?.clone()).map_err(|e| e.to_string())?;
    Ok(counts)
}
#[tauri::command]
fn cancel_ocr(state: tauri::State<State>) {
    state.ocr_cancel.store(true, Ordering::SeqCst);
}
#[tauri::command]
fn image_ocr_text(
    state: tauri::State<State>,
    id: String,
) -> Result<Option<archiver_core::ocr::OcrRecord>, String> {
    lock(&state.store)?.ocr_record(&id)
}
struct OcrJob(Arc<AtomicBool>);
impl Drop for OcrJob {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
fn recognize_item(
    store: &Arc<Mutex<Store>>,
    id: &str,
    path: &std::path::Path,
) -> Result<archiver_core::ocr::OcrRecord, String> {
    let reps = {
        let db = lock(store)?;
        if db.content(id)?.0 != "image" {
            return Err("Choose an image item".into());
        }
        db.payload(id)?
    };
    let mut record = archiver_core::ocr::recognize(&reps, path).unwrap_or_else(|error| {
        archiver_core::ocr::OcrRecord {
            error,
            ..Default::default()
        }
    });
    if !record.error.is_empty() {
        if let Some(previous) = lock(store)?.ocr_record(id)? {
            record.text = previous.text;
            record.language = previous.language;
        }
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;
    lock(store)?.save_ocr(id, &record, now)?;
    Ok(record)
}
fn run_ocr_batch(
    app: &tauri::AppHandle,
    store: &Arc<Mutex<Store>>,
    cancel: &AtomicBool,
    path: &std::path::Path,
    batches: Option<usize>,
) -> Result<(), String> {
    let mut completed = 0;
    loop {
        if cancel.load(Ordering::SeqCst) || batches.is_some_and(|limit| completed >= limit) {
            break;
        }
        let pending = lock(store)?.pending_ocr()?;
        if pending.is_empty() {
            break;
        }
        for id in pending {
            if cancel.load(Ordering::SeqCst)
                || (batches.is_some() && app.state::<State>().paused.load(Ordering::SeqCst))
            {
                break;
            }
            if lock(store)?.content(&id).is_err() {
                continue;
            }
            match recognize_item(store, &id, path) {
                Ok(record) => {
                    if record.error.contains("No OCR language") {
                        return Err(record.error);
                    }
                }
                Err(e) => {
                    if lock(store)?.content(&id).is_ok() {
                        return Err(e);
                    }
                }
            }
            app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
        }
        completed += 1;
    }
    Ok(())
}
#[tauri::command]
async fn scan_image_text(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
    id: Option<String>,
) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("OCR recognition currently requires Windows".into());
    }
    state
        .ocr_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "An OCR scan is already running")?;
    let job = OcrJob(state.ocr_running.clone());
    state.ocr_cancel.store(false, Ordering::SeqCst);
    let cancel = state.ocr_cancel.clone();
    let store = state.store.clone();
    let path = state.data_path.join("ocr-tmp");
    let error = state.ocr_error.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _job = job;
        if let Some(id) = id {
            recognize_item(&store, &id, &path)?;
            app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
            return Ok(());
        }
        let result = run_ocr_batch(&app, &store, &cancel, &path, None);
        *lock(&error)? = result.as_ref().err().cloned();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn startup_status(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
#[tauri::command]
fn launch_at_signin(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|e| e.to_string())
}
#[tauri::command]
async fn check_updates(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
) -> Result<Option<serde_json::Value>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let endpoint = option_env!("ARCHIVER_UPDATE_ENDPOINT")
        .filter(|s| !s.is_empty())
        .ok_or("This build has no release update endpoint configured")?;
    let key = option_env!("ARCHIVER_UPDATE_PUBLIC_KEY")
        .filter(|s| !s.is_empty())
        .ok_or("This build has no update verification key configured")?;
    let url = url::Url::parse(endpoint).map_err(|e| e.to_string())?;
    if url.scheme() != "https" {
        return Err("Update endpoint must use HTTPS".into());
    }
    let update = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let result = update
        .as_ref()
        .map(|u| serde_json::json!({"version":u.version,"notes":u.body}));
    *lock(&state.update)? = update;
    Ok(result)
}
#[tauri::command]
async fn install_update(state: tauri::State<'_, State>) -> Result<(), String> {
    let update = lock(&state.update)?
        .take()
        .ok_or("Check for an update first")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    paused: bool,
    clipboard: String,
    shells: Vec<String>,
    error: Option<String>,
    data_path: String,
}
#[derive(Deserialize, Serialize, Default)]
struct CapturePolicy {
    paused: bool,
}
fn write_policy(path: &std::path::Path, paused: bool) -> Result<(), String> {
    let temporary = path.with_extension("pending");
    let bytes = serde_json::to_vec(&CapturePolicy { paused }).map_err(|e| e.to_string())?;
    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path).map_err(|e| e.to_string())
}
fn lock<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, String> {
    mutex.lock().map_err(|_| "Archive state unavailable".into())
}
#[tauri::command]
fn list_items(
    state: tauri::State<State>,
    query: String,
    filter: String,
    offset: i64,
    directory: Option<String>,
    options: Option<archiver_core::search::SearchOptions>,
) -> Result<Vec<Item>, String> {
    lock(&state.store)?.search_items(
        &query,
        &filter,
        50,
        offset,
        directory.as_deref().unwrap_or(""),
        &options.unwrap_or_default(),
    )
}
#[tauri::command]
fn clear_library(app: tauri::AppHandle, state: tauri::State<State>) -> Result<usize, String> {
    let count = lock(&state.store)?.clear_library()?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
    Ok(count)
}
#[tauri::command]
fn undo_library_clear(app: tauri::AppHandle, state: tauri::State<State>) -> Result<usize, String> {
    let count = lock(&state.store)?.undo_library_clear()?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
    Ok(count)
}
#[tauri::command]
fn bulk_organization(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    ids: Vec<String>,
    tags: Vec<String>,
    collections: Vec<String>,
    remove: bool,
) -> Result<(), String> {
    lock(&state.store)?.bulk_organization(&ids, &tags, &collections, remove)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn session_timeline(
    state: tauri::State<State>,
    session: String,
    offset: i64,
) -> Result<Vec<serde_json::Value>, String> {
    lock(&state.store)?.session_timeline(&session, offset)
}
#[tauri::command]
fn restore_library_item(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
) -> Result<(), String> {
    lock(&state.store)?.restore_library_item(&id)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn saved_searches(
    state: tauri::State<State>,
) -> Result<Vec<archiver_core::search::SavedSearch>, String> {
    lock(&state.store)?.saved_searches()
}
#[tauri::command]
fn save_search(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    search: archiver_core::search::SavedSearch,
) -> Result<(), String> {
    lock(&state.store)?.save_search(&search)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn delete_search(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    name: String,
) -> Result<(), String> {
    lock(&state.store)?.delete_search(&name)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn collection_groups(state: tauri::State<State>) -> Result<Vec<String>, String> {
    lock(&state.store)?.collection_groups()
}
#[tauri::command]
fn rename_collection(app: tauri::AppHandle, state: tauri::State<State>, old: String, new: String) -> Result<(), String> {
    lock(&state.store)?.rename_collection(&old, &new)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn archive_statistics(state: tauri::State<State>) -> Result<serde_json::Value, String> {
    lock(&state.store)?.archive_statistics()
}
#[tauri::command]
fn item_labels(state: tauri::State<State>, id: String) -> Result<Vec<(String, String)>, String> {
    lock(&state.store)?.labels(&id)
}
#[tauri::command]
fn set_item_labels(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
    kind: String,
    names: Vec<String>,
) -> Result<(), String> {
    lock(&state.store)?.set_labels(&id, &kind, &names)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn set_item_organization(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
    tags: Vec<String>,
    collections: Vec<String>,
) -> Result<(), String> {
    lock(&state.store)?.set_organization(&id, &tags, &collections)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn command_sessions(state: tauri::State<State>) -> Result<Vec<serde_json::Value>, String> {
    lock(&state.store)?.command_sessions()
}
#[tauri::command]
fn archive_stats(state: tauri::State<State>) -> Result<Stats, String> {
    lock(&state.store)?.stats()
}
#[tauri::command]
fn occurrence_timeline(
    state: tauri::State<State>,
    id: String,
    offset: i64,
) -> Result<Vec<archiver_core::store::Occurrence>, String> {
    lock(&state.store)?.timeline(&id, offset)
}
#[tauri::command]
fn link_domains(state: tauri::State<State>) -> Result<Vec<(String, i64)>, String> {
    lock(&state.store)?.domains()
}
#[tauri::command]
async fn url_preview(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
    id: String,
    fetch: bool,
) -> Result<String, String> {
    let store = state.store.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if !fetch {
            return lock(&store)?.link_title(&id);
        }
        let (_, text) = lock(&store)?.content(&id)?;
        let title = archiver_core::link_preview::fetch(&text)?;
        lock(&store)?.save_link_title(&id, &title)?;
        Ok(title)
    })
    .await
    .map_err(|e| e.to_string())??;
    if fetch {
        app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
    }
    Ok(result)
}
#[tauri::command]
async fn file_preview(
    state: tauri::State<'_, State>,
    id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let (kind, text) = lock(&state.store)?.content(&id)?;
    if kind != "files" {
        return Err("Choose a file clipboard item".into());
    }
    tauri::async_runtime::spawn_blocking(move||text.lines().take(1000).map(|path|{
  let data=std::fs::metadata(path);match data{Ok(meta)=>serde_json::json!({"path":path,"available":true,"directory":meta.is_dir(),"bytes":meta.len(),"modified":meta.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|t|t.as_millis() as u64)}),Err(error)=>serde_json::json!({"path":path,"available":false,"error":error.to_string()})}
 }).collect()).await.map_err(|e|e.to_string())
}
#[tauri::command]
async fn file_content_preview(
    state: tauri::State<'_, State>,
    id: String,
    path: String,
) -> Result<serde_json::Value, String> {
    let (kind, text) = lock(&state.store)?.content(&id)?;
    if kind != "files" || !text.lines().any(|original| original == path) {
        return Err("Choose a path from this file clipboard item".into());
    }
    let worker = state.preview_worker.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _worker = lock(&worker)?;
        archiver_core::file_preview::content(std::path::Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn image_preview(
    state: tauri::State<'_, State>,
    id: String,
    thumbnail: bool,
) -> Result<archiver_core::preview::Preview, String> {
    let store = state.store.clone();
    let worker = state.preview_worker.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Serialize decoding to bound peak memory; SQLite locks are released during decoding.
        let _worker = lock(&worker)?;
        let reps = {
            let store = lock(&store)?;
            if thumbnail {
                if let Some(preview) = store.thumbnail(&id)? {
                    return Ok(preview);
                }
            }
            store.payload(&id)?
        };
        let preview = archiver_core::preview::generate(&reps, thumbnail)?;
        if thumbnail {
            lock(&store)?.save_thumbnail(&id, &preview)?;
        }
        Ok(preview)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn pin_item(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    lock(&state.store)?.pin(&id, pinned)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn rename_item(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
    title: String,
) -> Result<(), String> {
    lock(&state.store)?.rename_item(&id, &title)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn delete_item(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let hours = lock(&state.settings)?.recovery_hours as i64;
    lock(&state.store)?.delete_with_recovery(&id, now, hours * 3600000)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn recovery_items(state: tauri::State<State>) -> Result<Vec<(String, i64)>, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    lock(&state.store)?.recovery_items(now)
}
#[tauri::command]
fn undo_delete(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    lock(&state.store)?.undo_delete(&id, now)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
async fn export_archive(
    state: tauri::State<'_, State>,
    path: String,
    backup: bool,
) -> Result<String, String> {
    let store = state.store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err("Choose an absolute output path".into());
        }
        let manifest = path.with_extension(if backup {
            "sqlite.sha256"
        } else {
            "jsonl.sha256"
        });
        if manifest.exists() {
            return Err("Checksum file already exists; choose a new filename".into());
        }
        let hash = if backup {
            lock(&store)?.backup_verified(&path)?
        } else {
            lock(&store)?.export_jsonl(&path)?
        };
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(manifest)
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(hash.as_bytes())?;
                f.sync_all()
            })
            .map_err(|e| e.to_string())?;
        Ok(hash)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn verify_backup(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        archiver_core::archive_io::verify_sqlite(&path)?;
        let hash = archiver_core::archive_io::digest(&path)?;
        let saved = std::fs::read_to_string(path.with_extension("sqlite.sha256"))
            .map_err(|e| e.to_string())?;
        if saved.trim() != hash {
            return Err("Checksum mismatch; this backup changed after creation".into());
        }
        Ok(hash)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn pause_capture(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    paused: bool,
) -> Result<(), String> {
    write_policy(&state.data_path.join("capture-state.json"), paused)?;
    state.paused.store(paused, Ordering::Relaxed);
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn capture_status(state: tauri::State<State>) -> Result<Status, String> {
    Ok(Status {
        paused: state.paused.load(Ordering::Relaxed),
        clipboard: lock(&state.health)?.clone(),
        shells: lock(&state.shells)?.iter().cloned().collect(),
        error: lock(&state.error)?.clone(),
        data_path: state.data_path.to_string_lossy().into_owned(),
    })
}
#[tauri::command]
fn app_settings(state: tauri::State<State>) -> Result<Settings, String> {
    Ok(lock(&state.settings)?.clone())
}
#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    settings: Settings,
) -> Result<(), String> {
    let settings = settings.normalized()?;
    let shortcut: tauri_plugin_global_shortcut::Shortcut = settings
        .shortcut
        .parse()
        .map_err(|e| format!("Invalid shortcut: {e}"))?;
    if shortcut.mods.is_empty() {
        return Err("Include Ctrl, Alt, Shift or Super in the shortcut".into());
    }
    let mut current = lock(&state.settings)?;
    let old: tauri_plugin_global_shortcut::Shortcut = current
        .shortcut
        .parse()
        .map_err(|e| format!("Invalid stored shortcut: {e}"))?;
    let changed = shortcut != old;
    // Reserve the new key first, so a conflict leaves the existing shortcut working.
    if changed {
        app.global_shortcut()
            .register(shortcut)
            .map_err(|e| format!("Shortcut unavailable: {e}"))?;
    }
    if let Err(e) = settings.save(&state.data_path.join("settings.json")) {
        if changed {
            let _ = app.global_shortcut().unregister(shortcut);
        }
        return Err(e);
    }
    if changed {
        if let Err(e) = app.global_shortcut().unregister(old) {
            let _ = current.save(&state.data_path.join("settings.json"));
            let _ = app.global_shortcut().unregister(shortcut);
            return Err(format!("Could not replace the previous shortcut: {e}"));
        }
    }
    *current = settings;
    drop(current);
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn copy_item(
    window: tauri::WebviewWindow,
    state: tauri::State<State>,
    id: Option<String>,
    text: String,
    plain: bool,
) -> Result<(), String> {
    let reps = match id {
        Some(id) => lock(&state.store)?.payload(&id)?,
        None => vec![],
    };
    let plain = plain || reps.is_empty();
    #[cfg(windows)]
    {
        archiver_core::clipboard::restore(
            window.hwnd().map_err(|e| e.to_string())?.0 as _,
            &reps,
            &text,
            plain,
        )
    }
    #[cfg(not(windows))]
    {
        let _ = (window, reps, text, plain);
        Err("Clipboard replay on this platform is not implemented yet".into())
    }
}
#[tauri::command]
async fn paste_item(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, State>,
    id: Option<String>,
    plain: bool,
    prepared: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use archiver_core::{clipboard, delivery};
        let target = lock(&state.destination)?
            .ok_or("Open quick access from the destination app before pasting.")?;
        let (kind, original) = match &id {
            Some(id) => lock(&state.store)?.content(id)?,
            None if prepared.as_ref().is_some_and(|text| !text.is_empty()) =>
                ("text".to_owned(), String::new()),
            None => return Err("Nothing to paste".into()),
        };
        let transformed = prepared.is_some();
        let text = prepared.unwrap_or(original);
        if kind == "command" {
            return Err("Use Insert command to edit terminal input without executing.".into());
        }
        let source = unsafe { clipboard::process_name(target.pid) }.to_lowercase();
        if [
            "windowsterminal.exe",
            "cmd.exe",
            "powershell.exe",
            "pwsh.exe",
            "conhost.exe",
            "mintty.exe",
            "wezterm-gui.exe",
            "alacritty.exe",
        ]
        .contains(&source.as_str())
        {
            return Err("Use the shell insertion integration for terminal destinations; ordinary multiline paste can execute commands.".into());
        }
        let reps = if transformed {
            vec![]
        } else {
            lock(&state.store)?.payload(id.as_ref().ok_or("No clipboard item selected")?)?
        };
        let busy = state.inserting.clone();
        if busy.swap(true, Ordering::SeqCst) {
            return Err("Another delivery is in progress".into());
        }
        tauri::async_runtime::spawn_blocking(move || {
            struct Busy(Arc<AtomicBool>);
            impl Drop for Busy {
                fn drop(&mut self) {
                    self.0.store(false, Ordering::SeqCst);
                }
            }
            let _busy = Busy(busy);
            delivery::wait_release()?;
            if delivery::Target::current().is_none_or(|current| {
                current.pid
                    != unsafe { windows_sys::Win32::System::Threading::GetCurrentProcessId() }
            }) {
                return Err("Focus left Archiver before paste. Nothing was sent.".into());
            }
            let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as _;
            window.hide().map_err(|e| e.to_string())?;
            target.restore_focus()?;
            clipboard::restore(hwnd, &reps, &text, plain)?;
            delivery::send_chord(
                target,
                &[
                    windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL,
                    0x56,
                ],
            )
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (window, state, id, plain, prepared);
        Err("Native paste is currently available on Windows only.".into())
    }
}
#[tauri::command]
fn paste_destination(state: tauri::State<State>) -> Result<String, String> {
    #[cfg(windows)]
    {
        Ok(lock(&state.destination)?
            .filter(|target| target.valid())
            .map(|target| unsafe { archiver_core::clipboard::process_name(target.pid) })
            .unwrap_or_else(|| "No destination captured".into()))
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        Ok("Not implemented on this platform".into())
    }
}
#[tauri::command]
fn shell_sessions(state: tauri::State<State>) -> Vec<archiver_core::shell::Session> {
    archiver_core::shell::sessions(&state.data_path)
        .into_iter()
        .filter(|session| {
            #[cfg(windows)]
            {
                let name = unsafe { archiver_core::clipboard::process_name(session.pid) };
                ["powershell.exe", "pwsh.exe", "cmd.exe"].contains(&name.to_lowercase().as_str())
                    || session.source.starts_with("WSL / ")
            }
            #[cfg(not(windows))]
            {
                std::path::Path::new(&format!("/proc/{}", session.pid)).exists()
            }
        })
        .collect()
}
#[tauri::command]
fn integration_health(state: tauri::State<State>) -> Vec<serde_json::Value> {
    archiver_core::shell::sessions(&state.data_path)
        .into_iter()
        .map(|session| {
            #[cfg(windows)]
            let connection = if session.source.starts_with("WSL / ") {
                "Reported; WSL process unverified"
            } else {
                let name = unsafe { archiver_core::clipboard::process_name(session.pid) };
                if ["powershell.exe", "pwsh.exe", "cmd.exe"].contains(&name.to_lowercase().as_str())
                {
                    "Connected"
                } else {
                    "Disconnected"
                }
            };
            #[cfg(not(windows))]
            let connection = if std::path::Path::new(&format!("/proc/{}", session.pid)).exists() {
                "Connected"
            } else {
                "Process unverified"
            };
            serde_json::json!({"session":session,"connection":connection})
        })
        .collect()
}
#[tauri::command]
async fn insert_command(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, State>,
    id: String,
    session: String,
    prepared: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use archiver_core::{clipboard, delivery, shell};
        let target =
            lock(&state.destination)?.ok_or("Open quick access from the terminal first.")?;
        let (_, original) = lock(&state.store)?.content(&id)?;
        let text = prepared.unwrap_or(original);
        let root = state.data_path.clone();
        let connection = shell::read_session(&root, &session)?;
        if !connection.ready || !connection.insertion {
            return Err("This shell is busy or insertion is unavailable. Restart it after updating the integrations.".into());
        }
        let source = unsafe { clipboard::process_name(target.pid) }.to_lowercase();
        if ![
            "windowsterminal.exe",
            "cmd.exe",
            "powershell.exe",
            "pwsh.exe",
            "conhost.exe",
        ]
        .contains(&source.as_str())
        {
            return Err("The previous app is not a supported terminal. Open quick access from PowerShell or CMD.".into());
        }
        if ["cmd.exe", "powershell.exe", "pwsh.exe"].contains(&source.as_str())
            && target.pid != connection.pid
        {
            return Err("Choose the session belonging to the destination terminal.".into());
        }
        let busy = state.inserting.clone();
        if busy.swap(true, Ordering::SeqCst) {
            return Err("Another insertion is in progress".into());
        }
        tauri::async_runtime::spawn_blocking(move || {
            struct Busy(Arc<AtomicBool>);
            impl Drop for Busy {fn drop(&mut self) {self.0.store(false, Ordering::SeqCst);}}
            let _busy = Busy(busy);
            delivery::wait_release()?;
            if delivery::Target::current().is_none_or(|current| current.pid != unsafe {windows_sys::Win32::System::Threading::GetCurrentProcessId()}) {return Err("Focus left Archiver before insertion. Nothing was sent.".into());}
            let request_id = uuid::Uuid::new_v4().to_string();
            let expires = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() + 3;
            let request = shell::insertion_request(&request_id, expires, &text)?;
            let path = root.join(format!("insert-{session}.txt"));
            let ack = path.with_extension("txt.ack");
            let pending = path.with_extension("pending");
            let _ = std::fs::remove_file(&ack);
            std::fs::write(&pending, request).map_err(|e| e.to_string())?;
            std::fs::rename(&pending, &path).map_err(|e| e.to_string())?;
            let result = (|| {
                window.hide().map_err(|e| e.to_string())?;
                target.restore_focus()?;
                // Ctrl+X, Ctrl+A invokes the integrated editor callback. No Enter,
                // clipboard paste, eval, AcceptLine or command execution path.
                use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL;
                delivery::send_chord(target, &[VK_CONTROL, 0x58])?;
                delivery::send_chord(target, &[VK_CONTROL, 0x41])?;
                let start = std::time::Instant::now();
                while start.elapsed() < Duration::from_millis(1400) {
                    if std::fs::read_to_string(&ack).is_ok_and(|ack| ack == request_id) {return Ok(());}
                    std::thread::sleep(Duration::from_millis(15));
                }
                Err("Insertion was not acknowledged. Check the terminal before retrying, and make sure the selected session matches its active tab.".into())
            })();
            let _ = std::fs::remove_file(path);
            let _ = std::fs::remove_file(ack);
            result
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (window, state, id, session, prepared);
        Err("Shell insertion is currently available on Windows only".into())
    }
}
#[tauri::command]
fn show_quick(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    archiver_core::delivery::remember(&app.state::<State>().destination);
    let window = app
        .get_webview_window("quick")
        .ok_or("Quick panel unavailable")?;
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = ((480.0 * scale) as u32).min(area.size.width.saturating_sub(32).max(1));
        let height = ((720.0 * scale) as u32).min(area.size.height.saturating_sub(32).max(1));
        window
            .set_size(tauri::PhysicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        window
            .set_position(tauri::PhysicalPosition::new(
                area.position.x + ((area.size.width - width) / 2) as i32,
                area.position.y + ((area.size.height - height) / 2) as i32,
            ))
            .map_err(|e| e.to_string())?;
    } else {
        window.center().map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
fn save_snippet(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: Option<String>,
    name: String,
    kind: String,
    text: String,
    note: Option<String>,
    collection: Option<String>,
) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let id = lock(&state.store)?.save_snippet_in_group(
        id.as_deref(),
        &name,
        &kind,
        &text,
        note.as_deref(),
        collection.as_deref(),
        now,
    )?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
    Ok(id)
}
#[tauri::command]
fn overwrite_clip(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    id: String,
    text: String,
) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    lock(&state.store)?.replace_item_text(&id, &text, now)?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())
}
fn archivist_shortcut() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers};
    tauri_plugin_global_shortcut::Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::ALT),
        Code::KeyO,
    )
}
#[tauri::command]
fn save_text_clip(
    app: tauri::AppHandle,
    state: tauri::State<State>,
    text: String,
    destination: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Nothing to save".into());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let capture = Capture {
        kind: "text".into(),
        text,
        source: "Paste Playground".into(),
        timestamp: now,
        directory: String::new(),
        session: String::new(),
        sequence: None,
        representations: vec![],
    };
    let id = lock(&state.store)?.capture_text_item(&capture, destination != "archive")?;
    app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
    Ok(id)
}
/// Smoothly move the Librarian between rectangles (ease-in-out, ~200 ms).
fn animate_quick(
    window: tauri::WebviewWindow,
    to_size: tauri::PhysicalSize<u32>,
    to_pos: tauri::PhysicalPosition<i32>,
) {
    let from_size = window.outer_size();
    let from_pos = window.outer_position();
    let (Ok(fs), Ok(fp)) = (from_size, from_pos) else {
        return;
    };
    if !window.is_visible().unwrap_or(false) {
        let _ = window.set_size(to_size);
        let _ = window.set_position(to_pos);
        return;
    }
    std::thread::spawn(move || {
        const FRAMES: u32 = 14;
        for i in 1..=FRAMES {
            let t = i as f64 / FRAMES as f64;
            let e = t * t * (3.0 - 2.0 * t);
            let lerp = |a: f64, b: f64| a + (b - a) * e;
            let _ = window.set_size(tauri::PhysicalSize::new(
                lerp(fs.width as f64, to_size.width as f64).round() as u32,
                lerp(fs.height as f64, to_size.height as f64).round() as u32,
            ));
            let _ = window.set_position(tauri::PhysicalPosition::new(
                lerp(fp.x as f64, to_pos.x as f64).round() as i32,
                lerp(fp.y as f64, to_pos.y as f64).round() as i32,
            ));
            std::thread::sleep(Duration::from_millis(14));
        }
    });
}
/// Temporarily enlarge the Librarian (Expanded Librarian); `false` restores the prior size and position.
#[tauri::command]
fn set_quick_expanded(app: tauri::AppHandle, expanded: bool) -> Result<(), String> {
    static SAVED: Mutex<Option<(tauri::PhysicalSize<u32>, tauri::PhysicalPosition<i32>)>> =
        Mutex::new(None);
    let window = app
        .get_webview_window("quick")
        .ok_or("Quick panel unavailable")?;
    let mut saved = SAVED.lock().map_err(|e| e.to_string())?;
    if expanded {
        if saved.is_none() {
            *saved = Some((
                window.outer_size().map_err(|e| e.to_string())?,
                window.outer_position().map_err(|e| e.to_string())?,
            ));
        }
        let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? else {
            return Ok(());
        };
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = ((1040.0 * scale) as u32).min(area.size.width.saturating_sub(32).max(1));
        let height = ((800.0 * scale) as u32).min(area.size.height.saturating_sub(32).max(1));
        animate_quick(
            window,
            tauri::PhysicalSize::new(width, height),
            tauri::PhysicalPosition::new(
                area.position.x + ((area.size.width - width) / 2) as i32,
                area.position.y + ((area.size.height - height) / 2) as i32,
            ),
        );
    } else if let Some((size, position)) = saved.take() {
        animate_quick(window, size, position);
    }
    Ok(())
}
#[tauri::command]
fn show_archive(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Archive window unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    let _ = window.unminimize();
    window.set_focus().map_err(|e| e.to_string())?;
    if let Some(quick) = app.get_webview_window("quick") {
        quick.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
async fn import_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
    path: String,
    format: String,
    preview: bool,
) -> Result<usize, String> {
    let store = state.store.clone();
    let count = tauri::async_runtime::spawn_blocking(move || {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let captures =
            archiver_core::history_import::read(std::path::Path::new(&path), &format, now)?;
        if preview {
            Ok(captures.len())
        } else {
            lock(&store)?.capture_batch(&captures)
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    if !preview {
        app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
    }
    Ok(count)
}
fn setup_spool(
    app: tauri::AppHandle,
    store: Arc<Mutex<Store>>,
    paused: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    shells: Arc<Mutex<BTreeSet<String>>>,
    spool: PathBuf,
) {
    std::thread::spawn(move || {
        let mut version = 0;
        let mut cleanup = std::time::Instant::now() - Duration::from_secs(60);
        loop {
            if let Ok(store) = store.lock() {
                if let Ok(current) = store.external_changes() {
                    if version != 0 && current != version {
                        let _ = app.emit("archive-changed", ());
                    }
                    version = current;
                }
                if cleanup.elapsed() >= Duration::from_secs(60) {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;
                    let _ = store.purge_recovery(now);
                    cleanup = std::time::Instant::now();
                }
            }
            if !paused.load(Ordering::Relaxed) {
                if let Ok(entries) = std::fs::read_dir(&spool) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|p| p.to_str()) != Some("json") {
                            continue;
                        }
                        let result = (|| -> Result<(), String> {
                            let data = std::fs::read(&path).map_err(|e| e.to_string())?;
                            let value: serde_json::Value =
                                serde_json::from_slice(&data).map_err(|e| e.to_string())?;
                            if value["kind"] == "command_result" {
                                let result: archiver_core::store::CommandResult =
                                    serde_json::from_value(value).map_err(|e| e.to_string())?;
                                lock(&store)?.command_result(&result)?;
                                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                                app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
                                return Ok(());
                            }
                            let capture: Capture =
                                serde_json::from_value(value).map_err(|e| e.to_string())?;
                            if capture.kind != "command" {
                                return Err("Shell spool received a non-command event".into());
                            }
                            lock(&store)?.capture(&capture)?;
                            lock(&shells)?.insert(capture.source);
                            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                            app.emit("archive-changed", ()).map_err(|e| e.to_string())?;
                            Ok(())
                        })();
                        if let Err(message) = result {
                            if let Ok(mut e) = error.lock() {
                                *e = Some(format!("Shell spool: {message}"));
                            }
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if *shortcut == archivist_shortcut() {
                            let _ = show_archive(app.clone());
                            return;
                        }
                        if let Err(e) = show_quick(app.clone()) {
                            if let Some(state) = app.try_state::<State>() {
                                if let Ok(mut error) = state.error.lock() {
                                    *error = Some(e);
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            list_items,
            clear_library,
            undo_library_clear,
            bulk_organization,
            session_timeline,
            restore_library_item,
            saved_searches,
            save_search,
            delete_search,
            collection_groups,
            rename_collection,
            archive_statistics,
            item_labels,
            set_item_labels,
            set_item_organization,
            command_sessions,
            archive_stats,
            occurrence_timeline,
            url_preview,
            link_domains,
            file_preview,
            file_content_preview,
            image_preview,
            ocr_status,
            cancel_ocr,
            image_ocr_text,
            scan_image_text,
            pin_item,
            rename_item,
            delete_item,
            recovery_items,
            undo_delete,
            export_archive,
            verify_backup,
            startup_status,
            launch_at_signin,
            check_updates,
            install_update,
            pause_capture,
            capture_status,
            copy_item,
            paste_item,
            paste_destination,
            shell_sessions,
            integration_health,
            insert_command,
            save_snippet,
            import_history,
            app_settings,
            save_settings,
            show_quick,
            show_archive,
            save_text_clip,
            overwrite_clip,
            set_quick_expanded
        ])
        .setup(|app| {
            let data_path = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_path)?;
            let spool = data_path.join("shell-spool");
            std::fs::create_dir_all(&spool)?;
            let store = Arc::new(Mutex::new(
                Store::open(&data_path.join("archive.sqlite3")).map_err(std::io::Error::other)?,
            ));
            let policy_path = data_path.join("capture-state.json");
            let policy = if policy_path.exists() {
                serde_json::from_slice::<CapturePolicy>(&std::fs::read(&policy_path)?)?
            } else {
                CapturePolicy::default()
            };
            write_policy(&policy_path, policy.paused).map_err(std::io::Error::other)?;
            let paused = Arc::new(AtomicBool::new(policy.paused));
            let settings = Arc::new(Mutex::new(
                Settings::load(&data_path.join("settings.json")).map_err(std::io::Error::other)?,
            ));
            let error = Arc::new(Mutex::new(None));
            let health = Arc::new(Mutex::new("Not implemented on this platform".into()));
            let shells = Arc::new(Mutex::new(BTreeSet::new()));
            let (sender, receiver) = mpsc::sync_channel::<Capture>(64);
            #[cfg(windows)]
            let destination = Arc::new(Mutex::new(None));
            #[cfg(windows)]
            archiver_core::delivery::track(destination.clone());
            let app_handle = app.handle().clone();
            let image_queue = Arc::new(Mutex::new(BTreeSet::<String>::new()));
            let queued_images = image_queue.clone();
            let writer = store.clone();
            let writer_error = error.clone();
            std::thread::spawn(move || {
                for capture in receiver {
                    let result = lock(&writer).and_then(|mut s| s.capture_clipboard(&capture));
                    match result {
                        Ok(image_id) => {
                            if let Some(id) = image_id {
                                if let Ok(mut queue) = queued_images.lock() {
                                    queue.insert(id);
                                }
                            }
                            let _ = app_handle.emit("archive-changed", ());
                        }
                        Err(e) => {
                            if let Ok(mut error) = writer_error.lock() {
                                *error = Some(format!("Clipboard persistence failed: {e}"));
                            }
                            let _ = app_handle.emit("archive-changed", ());
                        }
                    }
                }
            });
            #[cfg(windows)]
            archiver_core::clipboard::start(
                sender,
                paused.clone(),
                health.clone(),
                error.clone(),
                settings.clone(),
            );
            #[cfg(not(windows))]
            drop(sender);
            setup_spool(
                app.handle().clone(),
                store.clone(),
                paused.clone(),
                error.clone(),
                shells.clone(),
                spool,
            );
            app.manage(State {
                store,
                paused,
                health,
                error,
                shells,
                data_path,
                settings: settings.clone(),
                inserting: Arc::new(AtomicBool::new(false)),
                preview_worker: Arc::new(Mutex::new(())),
                ocr_running: Arc::new(AtomicBool::new(false)),
                ocr_cancel: Arc::new(AtomicBool::new(false)),
                ocr_error: Arc::new(Mutex::new(None)),
                update: Mutex::new(None),
                #[cfg(windows)]
                destination,
            });
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut last = std::time::Instant::now();
                    loop {
                        std::thread::sleep(Duration::from_secs(5));
                        let state = handle.state::<State>();
                        let (interval, on_capture) = match lock(&state.settings) {
                            Ok(s) => (s.ocr_interval_seconds, s.ocr_on_capture),
                            Err(_) => continue,
                        };
                        if state.paused.load(Ordering::SeqCst) {
                            continue;
                        }
                        let batch_due =
                            interval != 0 && last.elapsed() >= Duration::from_secs(interval as u64);
                        if !on_capture {
                            if let Ok(mut queue) = image_queue.lock() {
                                queue.clear();
                            }
                        }
                        let queued = on_capture
                            && image_queue.lock().map(|q| !q.is_empty()).unwrap_or(false);
                        if !batch_due && !queued {
                            continue;
                        }
                        if state
                            .ocr_running
                            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                            .is_err()
                        {
                            continue;
                        }
                        let _job = OcrJob(state.ocr_running.clone());
                        state.ocr_cancel.store(false, Ordering::SeqCst);
                        let path = state.data_path.join("ocr-tmp");
                        let result = if batch_due {
                            let result = run_ocr_batch(
                                &handle,
                                &state.store,
                                &state.ocr_cancel,
                                &path,
                                Some(1),
                            );
                            last = std::time::Instant::now();
                            result
                        } else {
                            // Drain at most 25 event IDs per wake; never sweep unrelated old images.
                            (|| -> Result<(), String> {
                                for _ in 0..25 {
                                    if state.paused.load(Ordering::SeqCst)
                                        || state.ocr_cancel.load(Ordering::SeqCst)
                                    {
                                        break;
                                    }
                                    let id = lock(&image_queue)?.pop_first();
                                    let Some(id) = id else {
                                        break;
                                    };
                                    let db = lock(&state.store)?;
                                    if db.content(&id).is_err() || db.ocr_record(&id)?.is_some() {
                                        continue;
                                    }
                                    drop(db);
                                    let record = recognize_item(&state.store, &id, &path)?;
                                    handle
                                        .emit("archive-changed", ())
                                        .map_err(|e| e.to_string())?;
                                    if record.error.contains("No OCR language") {
                                        return Err(record.error);
                                    }
                                }
                                Ok(())
                            })()
                        };
                        if let Ok(mut error) = state.ocr_error.lock() {
                            *error = result.err();
                        };
                    }
                });
            }
            if std::env::args().any(|arg| arg == "--background") {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }
            if let Err(e) = app.global_shortcut().register(
                lock(&settings)
                    .map_err(std::io::Error::other)?
                    .shortcut
                    .as_str(),
            ) {
                if let Ok(mut error) = app.state::<State>().error.lock() {
                    *error = Some(format!("Quick-access shortcut unavailable: {e}"));
                }
            }
            let show = tauri::menu::MenuItem::with_id(
                app,
                "show",
                "Open the Archivist",
                true,
                None::<&str>,
            )?;
            let quit =
                tauri::menu::MenuItem::with_id(app, "quit", "Quit Archiver", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            let tray = image::load_from_memory(include_bytes!("../icons/tray.png"))?.to_rgba8();
            let (tray_width, tray_height) = tray.dimensions();
            tauri::tray::TrayIconBuilder::new()
                .icon(tauri::image::Image::new_owned(tray.into_raw(), tray_width, tray_height))
                .tooltip("Archiver · local history")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Ctrl+Alt+O is claimed system-wide only while the Librarian has focus, so
            // WebView2/other apps cannot swallow it before the page sees it.
            if let tauri::WindowEvent::Focused(focused) = event {
                if window.label() == "quick" {
                    let keys = window.app_handle().global_shortcut();
                    if *focused {
                        if let Err(e) = keys.register(archivist_shortcut()) {
                            if let Some(state) = window.app_handle().try_state::<State>() {
                                if let Ok(mut error) = state.error.lock() { *error = Some(format!("Archivist shortcut Ctrl+Alt+O unavailable: {e}. Use the Archivist button.")); }
                            }
                        }
                    } else {
                        let _ = keys.unregister(archivist_shortcut());
                    }
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Archiver could not start");
}
