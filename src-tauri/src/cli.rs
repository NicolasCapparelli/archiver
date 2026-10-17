//! Local JSON interface and shell bridge. Saved commands are data, never executed.
use archiver_core::{
    shell,
    store::{Capture, Store},
};
use serde_json::json;
use std::{
    io::{self, BufRead, Read, Write},
    path::PathBuf,
};
fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn root() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("ARCHIVER_DATA_DIR") {
        return Ok(path.into());
    }
    #[cfg(windows)]
    {
        Ok(
            PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA unavailable")?)
                .join("app.archiver.desktop"),
        )
    }
    #[cfg(target_os = "macos")]
    {
        Ok(
            PathBuf::from(std::env::var_os("HOME").ok_or("HOME unavailable")?)
                .join("Library/Application Support/app.archiver.desktop"),
        )
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Ok(std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or(
                PathBuf::from(std::env::var_os("HOME").ok_or("HOME unavailable")?)
                    .join(".local/share"),
            )
            .join("app.archiver.desktop"))
    }
}
fn stdin() -> Result<String, String> {
    let mut text = String::new();
    io::stdin()
        .take(1024 * 1024 + 1)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    if text.len() > 1024 * 1024 {
        return Err("Input exceeds 1 MB".into());
    }
    Ok(text)
}
fn atomic(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    let pending = path.with_extension(format!("{}.pending", uuid::Uuid::new_v4()));
    std::fs::write(&pending, data).map_err(|e| e.to_string())?;
    std::fs::rename(&pending, path).map_err(|e| e.to_string())
}
fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let get = |i: usize| {
        args.get(i)
            .map(|s| s.as_str())
            .ok_or("Missing argument".to_string())
    };
    let command = get(0)?;
    if command == "help" {
        println!("Archiver local JSON API\nsearch QUERY [FILTER] [OFFSET] [OPTIONS_JSON]\nread ITEM_ID\ncontribute (Capture JSON on stdin)\nsnippet (JSON name,kind,text,id? on stdin)\nimport PATH powershell|clink\nlibrary stats | clear | undo-clear | restore ITEM_ID\nsession-timeline SESSION [OFFSET]\nroot | uuid | serve (JSON Lines API)\nShell bridge: begin SESSION SEQUENCE SOURCE PID DIRECTORY (text stdin), finish SESSION SEQUENCE EXIT_CODE, session SESSION SOURCE PID DIRECTORY READY INSERTION, take SESSION, ack SESSION REQUEST_ID\nSet ARCHIVER_DATA_DIR to select an archive. Commands are never executed.");
        return Ok(());
    }
    if command == "uuid" {
        println!("{}", uuid::Uuid::new_v4());
        return Ok(());
    }
    let root = root()?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    if command == "root" {
        println!("{}", root.display());
        return Ok(());
    }
    if ["session", "begin", "finish", "take", "ack"].contains(&command) {
        let session = get(1)?;
        shell::session_path(&root, session)?;
        std::fs::create_dir_all(root.join("shell-sessions")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(root.join("shell-spool")).map_err(|e| e.to_string())?;
        match command {
            "session" => {
                let data = shell::Session {
                    session: session.into(),
                    source: get(2)?.into(),
                    pid: get(3)?.parse().map_err(|_| "Invalid PID")?,
                    directory: get(4)?.into(),
                    ready: get(5)? == "true",
                    insertion: get(6)? == "true",
                    updated_at: now(),
                };
                atomic(
                    &shell::session_path(&root, session)?,
                    &serde_json::to_vec(&data).map_err(|e| e.to_string())?,
                )?;
            }
            "begin" => {
                let policy: serde_json::Value = std::fs::read(root.join("capture-state.json"))
                    .ok()
                    .and_then(|data| serde_json::from_slice(&data).ok())
                    .unwrap_or(json!({}));
                if policy["paused"] == true {
                    return Ok(());
                }
                let seq: i64 = get(2)?.parse().map_err(|_| "Invalid sequence")?;
                if seq < 1 {
                    return Err("Invalid sequence".into());
                }
                let capture = Capture {
                    kind: "command".into(),
                    text: stdin()?,
                    source: get(3)?.into(),
                    timestamp: now(),
                    directory: get(5)?.into(),
                    session: session.into(),
                    sequence: Some(seq),
                    representations: vec![],
                };
                atomic(
                    &root.join(format!("shell-spool/{session}-{seq}.json")),
                    &serde_json::to_vec(&capture).map_err(|e| e.to_string())?,
                )?;
                atomic(
                    &root.join(format!("shell-sessions/{session}-{seq}.start")),
                    now().to_string().as_bytes(),
                )?;
            }
            "finish" => {
                let seq: i64 = get(2)?.parse().map_err(|_| "Invalid sequence")?;
                let code: i64 = get(3)?.parse().map_err(|_| "Invalid exit code")?;
                let start = root.join(format!("shell-sessions/{session}-{seq}.start"));
                if let Ok(text) = std::fs::read_to_string(&start) {
                    let duration =
                        (now() - text.parse::<i64>().map_err(|_| "Invalid start time")?).max(0);
                    let result = json!({"kind":"command_result","session":session,"sequence":seq,"exitCode":code,"successful":code==0,"durationMs":duration});
                    atomic(
                        &root.join(format!("shell-spool/{session}-{seq}-result.json")),
                        result.to_string().as_bytes(),
                    )?;
                    std::fs::remove_file(start).map_err(|e| e.to_string())?;
                }
            }
            "take" => {
                let path = root.join(format!("insert-{session}.txt"));
                if let Ok(text) = std::fs::read_to_string(&path) {
                    std::fs::remove_file(path).map_err(|e| e.to_string())?;
                    let (header, payload) = text.split_once('\n').ok_or("Invalid request")?;
                    let (id, expires) = header.split_once(' ').ok_or("Invalid request")?;
                    uuid::Uuid::parse_str(id).map_err(|_| "Invalid request ID")?;
                    if now() / 1000 > expires.parse::<i64>().map_err(|_| "Invalid expiry")? {
                        return Ok(());
                    }
                    print!("{id}\n{payload}");
                }
            }
            "ack" => {
                let id = get(2)?;
                uuid::Uuid::parse_str(id).map_err(|_| "Invalid request ID")?;
                atomic(
                    &root.join(format!("insert-{session}.txt.ack")),
                    id.as_bytes(),
                )?;
            }
            _ => unreachable!(),
        }
        return Ok(());
    }
    let mut store = Store::open(&root.join("archive.sqlite3"))?;
    if command == "serve" {
        // JSON Lines over stdio: no listening port, token, or network dependency.
        let mut input = io::stdin().lock();
        loop {
            let mut line = String::new();
            let read = (&mut input)
                .take(1024 * 1024 + 1)
                .read_line(&mut line)
                .map_err(|e| e.to_string())?;
            if read == 0 {
                break;
            }
            if line.len() > 1024 * 1024 {
                return Err("API request exceeds 1 MB".into());
            }
            let parsed: Result<serde_json::Value, String> =
                serde_json::from_str(&line).map_err(|e| e.to_string());
            let request_id = parsed
                .as_ref()
                .ok()
                .and_then(|request| request.get("id"))
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            let response = (|| -> Result<serde_json::Value, String> {
                let request = parsed?;
                let value = &request["params"];
                let field = |key: &str| value[key].as_str().ok_or(format!("Missing {key}"));
                let result = match request["method"].as_str().ok_or("Missing method")? {
                    "search" => serde_json::to_value(
                        store.search_items(
                            field("query")?,
                            value["filter"].as_str().unwrap_or("all"),
                            50,
                            value["offset"].as_i64().unwrap_or(0),
                            "",
                            &serde_json::from_value(
                                value.get("options").cloned().unwrap_or(json!({})),
                            )
                            .map_err(|e| e.to_string())?,
                        )?,
                    )
                    .map_err(|e| e.to_string())?,
                    "read" => {
                        let id = field("id")?;
                        let (kind, text) = store.content(id)?;
                        json!({"kind":kind,"text":text,"representations":store.payload(id)?,"ocr":store.ocr_record(id)?,"note":if id.starts_with("snippet:"){String::new()}else{store.clip_note(id)?}})
                    }
                    "contribute" => {
                        let capture: Capture =
                            serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
                        json!({"captured":store.capture(&capture)?})
                    }
                    "snippet" => {
                        json!({"id":store.save_snippet_with_note(value["id"].as_str(),field("name")?,field("kind")?,field("text")?,value["note"].as_str(),now())?})
                    }
                    "stats" => serde_json::to_value(store.stats()?).map_err(|e| e.to_string())?,
                    "sessions" => json!(store.command_sessions()?),
                    "session_timeline" => json!(store.session_timeline(
                        field("session")?,
                        value["offset"].as_i64().unwrap_or(0)
                    )?),
                    "library_stats" => json!({"items":store.library_count()?}),
                    "clear_library" => json!({"archived":store.clear_library()?}),
                    "undo_library_clear" => json!({"restored":store.undo_library_clear()?}),
                    "restore_library_item" => {
                        store.restore_library_item(field("id")?)?;
                        json!({"restored":true})
                    }
                    _ => return Err("Unknown API method".into()),
                };
                Ok(json!({"id":request["id"],"result":result}))
            })();
            println!(
                "{}",
                response.unwrap_or_else(|error| json!({"id":request_id,"error":error}))
            );
            io::stdout().flush().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let output = match command {
        "library" => match get(1)? {
            "stats" => json!({"items":store.library_count()?}),
            "clear" => json!({"archived":store.clear_library()?}),
            "undo-clear" => json!({"restored":store.undo_library_clear()?}),
            "restore" => {
                store.restore_library_item(get(2)?)?;
                json!({"restored":true})
            }
            _ => return Err("Use library stats, clear, undo-clear, or restore ID".into()),
        },
        "session-timeline" => json!(store.session_timeline(
            get(1)?,
            args.get(2).and_then(|s| s.parse().ok()).unwrap_or(0)
        )?),
        "search" => serde_json::to_value(
            store.search_items(
                get(1)?,
                args.get(2).map(|s| s.as_str()).unwrap_or("all"),
                50,
                args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0),
                "",
                &serde_json::from_str(args.get(4).map(String::as_str).unwrap_or("{}"))
                    .map_err(|e| e.to_string())?,
            )?,
        )
        .map_err(|e| e.to_string())?,
        "read" => {
            let (kind, text) = store.content(get(1)?)?;
            json!({"kind":kind,"text":text,"representations":store.payload(get(1)?)?,"ocr":store.ocr_record(get(1)?)?,"note":if get(1)?.starts_with("snippet:"){String::new()}else{store.clip_note(get(1)?)?}})
        }
        "contribute" => {
            let capture: Capture = serde_json::from_str(&stdin()?).map_err(|e| e.to_string())?;
            json!({"captured":store.capture(&capture)?})
        }
        "snippet" => {
            let value: serde_json::Value =
                serde_json::from_str(&stdin()?).map_err(|e| e.to_string())?;
            let field = |name: &str| value[name].as_str().ok_or(format!("Missing {name}"));
            json!({"id":store.save_snippet_with_note(value["id"].as_str(),field("name")?,field("kind")?,field("text")?,value["note"].as_str(),now())?})
        }
        "import" => {
            json!({"imported":store.capture_batch(&archiver_core::history_import::read(std::path::Path::new(get(1)?),get(2)?,now())?)?})
        }
        _ => return Err("Unknown command; run archiverctl help".into()),
    };
    println!("{output}");
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{}", json!({"error":error}));
        std::process::exit(1);
    }
}
