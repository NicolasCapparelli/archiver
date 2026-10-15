//! Derived OCR content; recognition never changes original clips.
use crate::store::{Result, Store};
use rusqlite::params;
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct OcrRecord {
    pub text: String,
    pub language: String,
    pub error: String,
}
pub fn initialize(conn: &rusqlite::Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS image_text(item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,text TEXT NOT NULL,language TEXT NOT NULL,error TEXT NOT NULL,updated INTEGER NOT NULL);").map_err(|e|e.to_string())
}
impl Store {
    pub fn ocr_record(&self, id: &str) -> Result<Option<OcrRecord>> {
        use rusqlite::OptionalExtension;
        self.conn
            .query_row(
                "SELECT text,language,error FROM image_text WHERE item_id=?",
                [id],
                |r| {
                    Ok(OcrRecord {
                        text: r.get(0)?,
                        language: r.get(1)?,
                        error: r.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
    }
    pub fn pending_ocr(&self) -> Result<Vec<String>> {
        let mut stmt=self.conn.prepare("SELECT i.id FROM items i JOIN events e ON e.rowid=(SELECT rowid FROM events WHERE item_id=i.id ORDER BY last_seen DESC,rowid DESC LIMIT 1) WHERE i.kind='image' AND NOT EXISTS(SELECT 1 FROM image_text WHERE item_id=i.id) ORDER BY e.last_seen DESC LIMIT 25").map_err(|e|e.to_string())?;
        let result = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(result)
    }
    pub fn ocr_counts(&self) -> Result<serde_json::Value> {
        self.conn.query_row("SELECT (SELECT COUNT(*) FROM items WHERE kind='image'),COUNT(*),COALESCE(SUM(error!=''),0) FROM image_text",[],|r|Ok(serde_json::json!({"images":r.get::<_,i64>(0)?,"scanned":r.get::<_,i64>(1)?,"failed":r.get::<_,i64>(2)?}))).map_err(|e|e.to_string())
    }
    pub fn save_ocr(&self, id: &str, record: &OcrRecord, now: i64) -> Result<()> {
        let (kind, text) = self.content(id)?;
        if kind != "image" {
            return Err("OCR requires an image item".into());
        }
        if record.text.len() > 1024 * 1024
            || record.language.len() > 100
            || record.error.len() > 4096
        {
            return Err("OCR result exceeds storage limits".into());
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO image_text VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET text=excluded.text,language=excluded.language,error=excluded.error,updated=excluded.updated",params![id,record.text,record.language,record.error,now]).map_err(|e|e.to_string())?;
        let title: String = tx
            .query_row("SELECT title FROM items WHERE id=?", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        crate::search::index(&tx, id, &format!("{title} {text} {}", record.text))?;
        tx.commit().map_err(|e| e.to_string())
    }
}
#[cfg(windows)]
pub fn recognize(
    reps: &[crate::store::Representation],
    root: &std::path::Path,
) -> Result<OcrRecord> {
    use std::{
        io::{Read, Write},
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    let png = crate::preview::ocr_png(reps)?;
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let path = root.join(format!("ocr-{}.png", uuid::Uuid::new_v4()));
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }
    let _cleanup = Cleanup(path.clone());
    std::fs::write(&path, png).map_err(|e| e.to_string())?;
    // Trusted embedded code; data arrives as JSON on stdin, never as executable script text.
    let script = include_str!("../../tools/ocr-windows.ps1");
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(
        script
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>(),
    );
    let exe = std::path::PathBuf::from(
        std::env::var_os("SystemRoot").ok_or("Windows system directory is unavailable")?,
    )
    .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut child = Command::new(exe)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &encoded,
        ])
        .creation_flags(0x08000000)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let input = serde_json::to_vec(&serde_json::json!({"path":path})).map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .ok_or("OCR input unavailable")?
        .write_all(&input)
        .map_err(|e| e.to_string())?;
    // Drain pipes concurrently so output cannot deadlock the recognizer.
    let stdout = child.stdout.take().ok_or("OCR output unavailable")?;
    let stderr = child.stderr.take().ok_or("OCR error output unavailable")?;
    let out = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(1024 * 1024 + 4096)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.take(8192).read_to_end(&mut bytes).map(|_| bytes)
    });
    let started = Instant::now();
    let mut timed_out = false;
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if started.elapsed() > Duration::from_secs(40) {
            let _ = child.kill();
            timed_out = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let output = out
        .join()
        .map_err(|_| "OCR output worker failed")?
        .map_err(|e| e.to_string())?;
    let error = err
        .join()
        .map_err(|_| "OCR error worker failed")?
        .map_err(|e| e.to_string())?;
    if timed_out {
        return Err("Windows OCR timed out after 40 seconds".into());
    }
    if !status.success() {
        let message: String = String::from_utf8_lossy(&error).chars().take(2000).collect();
        return Err(if message.trim().is_empty() {
            format!("Windows OCR exited with {status}")
        } else {
            message
        });
    }
    let record: OcrRecord = serde_json::from_slice(&output)
        .map_err(|e| format!("Invalid Windows OCR response: {e}"))?;
    Ok(record)
}
#[cfg(not(windows))]
pub fn recognize(_: &[crate::store::Representation], _: &std::path::Path) -> Result<OcrRecord> {
    Err("OCR recognition currently requires Windows".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    #[ignore = "requires installed Windows OCR language and tools/test-ocr.ps1 -KeepFixture"]
    fn actual_windows_worker_preserves_text_and_cleans_temporary_png() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("target");
        let path = root.join(format!("ocr-worker-{}-🛰", uuid::Uuid::new_v4()));
        let data = std::fs::read(root.join("ocr-fixture.png"))
            .expect("Run tools/test-ocr.ps1 -KeepFixture first");
        let result = recognize(
            &[crate::store::Representation {
                format: "PNG".into(),
                data,
            }],
            &path,
        )
        .unwrap();
        assert!(
            result.text.contains("ORBITAL ARCHIVE 42"),
            "{}",
            result.text
        );
        assert_eq!(std::fs::read_dir(&path).unwrap().count(), 0);
        std::fs::remove_dir(path).unwrap();
    }
    use crate::store::Capture;
    #[test]
    fn clipboard_events_target_only_the_copied_unscanned_image() {
        let mut store = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut capture = Capture {
            kind: "image".into(),
            text: "old image".into(),
            source: "test".into(),
            timestamp: 1,
            directory: "".into(),
            session: "".into(),
            sequence: None,
            representations: vec![],
        };
        store.capture(&capture).unwrap();
        let old = store.list("", "image", 1, 0).unwrap()[0].id.clone();
        capture.text = "new image".into();
        capture.timestamp = 2;
        let id = store.capture_clipboard(&capture).unwrap().unwrap();
        assert_ne!(id, old);
        assert_eq!(store.capture_clipboard(&capture).unwrap(), Some(id.clone()));
        for error in ["", "Unsupported image"] {
            store
                .save_ocr(
                    &id,
                    &OcrRecord {
                        error: error.into(),
                        ..Default::default()
                    },
                    3,
                )
                .unwrap();
            assert!(store.capture_clipboard(&capture).unwrap().is_none());
        }
        assert_eq!(store.pending_ocr().unwrap(), vec![old]);
        capture.kind = "text".into();
        assert!(store.capture_clipboard(&capture).unwrap().is_none());
    }
    #[test]
    fn extracted_text_is_searchable_recoverable_and_removed_with_image() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        s.capture(&Capture {
            kind: "image".into(),
            text: "screenshot".into(),
            source: "test".into(),
            timestamp: 1,
            directory: "".into(),
            session: "".into(),
            sequence: None,
            representations: vec![],
        })
        .unwrap();
        let id = s.list("", "image", 1, 0).unwrap()[0].id.clone();
        assert_eq!(s.pending_ocr().unwrap(), vec![id.clone()]);
        s.save_ocr(
            &id,
            &OcrRecord {
                text: "Launch orbital telescope".into(),
                language: "en-US".into(),
                error: "".into(),
            },
            2,
        )
        .unwrap();
        assert_eq!(s.list("orbital", "image", 50, 0).unwrap().len(), 1);
        assert!(s.pending_ocr().unwrap().is_empty());
        assert_eq!(s.fuzzy_ids("telescop").unwrap(), vec![id.clone()]);
        s.delete_with_recovery(&id, 10, 100).unwrap();
        assert!(s.ocr_record(&id).unwrap().is_none());
        s.undo_delete(&id, 20).unwrap();
        assert_eq!(s.ocr_record(&id).unwrap().unwrap().language, "en-US");
        assert_eq!(s.fuzzy_ids("telescop").unwrap(), vec![id.clone()]);
        s.delete(&id).unwrap();
        assert!(s.fuzzy_ids("telescop").unwrap().is_empty());
    }
    #[test]
    fn empty_and_failed_recognition_are_not_rescanned() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        for (time, text, error) in [
            (1, "blank screenshot", ""),
            (2, "unreadable screenshot", "Unsupported image"),
        ] {
            s.capture(&Capture {
                kind: "image".into(),
                text: text.into(),
                source: "test".into(),
                timestamp: time,
                directory: "".into(),
                session: "".into(),
                sequence: None,
                representations: vec![],
            })
            .unwrap();
            let id = s.list(text, "image", 1, 0).unwrap()[0].id.clone();
            s.save_ocr(
                &id,
                &OcrRecord {
                    error: error.into(),
                    ..Default::default()
                },
                time,
            )
            .unwrap();
        }
        assert!(s.pending_ocr().unwrap().is_empty());
        assert_eq!(s.ocr_counts().unwrap()["scanned"], 2);
        assert_eq!(s.ocr_counts().unwrap()["failed"], 1);
    }
}
