//! Treat imported archives as data. Only our own schema and fixed SQL run on the destination.
use crate::{
    archive_io::{self, Snapshot, Table, TABLES},
    store::{Result, Store},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{
    params_from_iter,
    types::{Value, ValueRef},
    Connection, TransactionBehavior,
};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read},
    path::Path,
};

const MAX_BYTES: u64 = 256 * 1024 * 1024;
const MAX_ROWS: usize = 250_000;
const EXTRA: [&str; 4] = [
    "saved_searches",
    "trash",
    "library_clear_snapshot",
    "item_revisions",
];
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub token: String,
    pub checksum: String,
    pub replacement: bool,
    pub items: u64,
    pub snippets: u64,
    pub occurrences: u64,
    pub current_items: u64,
    pub current_snippets: u64,
    pub current_occurrences: u64,
    pub added_items: u64,
    pub backup_path: Option<String>,
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{Capture, Representation};
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("target/test-temp")
                .join(format!("import-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn export(&self, s: &Store, sqlite: bool) -> std::path::PathBuf {
            let path = self.0.join(format!(
                "{}.{}",
                uuid::Uuid::new_v4(),
                if sqlite { "sqlite" } else { "jsonl" }
            ));
            let digest = if sqlite {
                s.backup_verified(&path)
            } else {
                s.export_jsonl(&path)
            }
            .unwrap();
            std::fs::write(
                path.with_extension(if sqlite {
                    "sqlite.sha256"
                } else {
                    "jsonl.sha256"
                }),
                digest,
            )
            .unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn memory() -> Store {
        Store::open(Path::new(":memory:")).unwrap()
    }
    #[test]
    fn portable_commands_ocr_and_full_backup_saved_groups_round_trip() {
        let f = Fixture::new();
        let mut source = memory();
        let mut command = clip("echo café", 1);
        command.kind = "command".into();
        command.session = "terminal-session".into();
        command.sequence = Some(1);
        source.capture(&command).unwrap();
        source
            .command_result(&crate::store::CommandResult {
                session: command.session.clone(),
                sequence: 1,
                exit_code: Some(7),
                successful: false,
                duration_ms: 45,
            })
            .unwrap();
        let mut image = clip("", 2);
        image.kind = "image".into();
        image.representations = vec![Representation {
            format: "PNG".into(),
            data: vec![1, 2, 3],
        }];
        source.capture(&image).unwrap();
        let image_id = source.list("", "image", 50, 0).unwrap()[0].id.clone();
        source
            .save_ocr(
                &image_id,
                &crate::ocr::OcrRecord {
                    text: "orbitalrecognition".into(),
                    language: "en-US".into(),
                    error: String::new(),
                },
                3,
            )
            .unwrap();
        source
            .save_search(&crate::search::SavedSearch {
                name: "Group: Empty reference".into(),
                query: String::new(),
                filter: "snippets".into(),
                options: crate::search::SearchOptions {
                    collection: "Empty reference".into(),
                    ..Default::default()
                },
            })
            .unwrap();
        let file = f.export(&source, false);
        let mut dest = memory();
        let p = dest.prepare_import(&file, false, None).unwrap();
        dest.apply_import(p, false).unwrap();
        let p = dest.prepare_import(&file, false, None).unwrap();
        dest.apply_import(p, false).unwrap();
        assert_eq!(count(&dest.conn, "command_results").unwrap(), 1);
        assert_eq!(count(&dest.conn, "events").unwrap(), 2);
        assert_eq!(dest.list("", "failed", 50, 0).unwrap().len(), 1);
        assert_eq!(
            dest.list("orbitalrecognition", "all", 50, 0).unwrap().len(),
            1
        );
        assert_eq!(
            dest.ocr_record(&image_id).unwrap().unwrap().language,
            "en-US"
        );
        let file = f.export(&source, true);
        let p = dest
            .prepare_import(
                &file,
                true,
                Some(f.0.join("before.sqlite").to_string_lossy().into()),
            )
            .unwrap();
        dest.apply_import(p, true).unwrap();
        assert_eq!(
            dest.saved_searches().unwrap()[0].name,
            "Group: Empty reference"
        );
    }
    fn clip(text: &str, time: i64) -> Capture {
        Capture {
            kind: "text".into(),
            text: text.into(),
            source: "test".into(),
            timestamp: time,
            directory: "C:\\café".into(),
            session: String::new(),
            sequence: None,
            representations: vec![],
        }
    }
    fn id(s: &Store, text: &str) -> String {
        s.list(text, "all", 50, 0).unwrap()[0].id.clone()
    }
    #[test]
    fn portable_merge_is_idempotent_and_preserves_unicode_payloads_notes_and_visibility() {
        let f = Fixture::new();
        let mut source = memory();
        let mut rich = clip("café 🛰 rich", 1);
        rich.kind = "rich".into();
        rich.representations = vec![Representation {
            format: "HTML Format".into(),
            data: vec![0, 255, 10, 13],
        }];
        source.capture(&rich).unwrap();
        let rich_id = id(&source, "rich");
        source.save_clip_note(&rich_id, "orbitalreference").unwrap();
        source
            .conn
            .execute("INSERT INTO labels VALUES(?,'tag','research')", [&rich_id])
            .unwrap();
        source
            .save_snippet_with_note(None, "bonjour", "text", "payload", Some("référence"), 1)
            .unwrap();
        source.capture(&clip("hidden from library", 2)).unwrap();
        source.clear_library().unwrap();
        let file = f.export(&source, false);
        let mut dest = memory();
        dest.capture(&rich).unwrap();
        let local = id(&dest, "rich");
        dest.rename_item(&local, "local pin name").unwrap();
        dest.save_clip_note(&local, "local note").unwrap();
        dest.clear_library().unwrap();
        let preview = dest.prepare_import(&file, false, None).unwrap();
        assert_eq!(preview.preview.added_items, 1);
        assert_eq!(count(&dest.conn, "items").unwrap(), 1);
        dest.apply_import(preview, false).unwrap();
        assert_eq!(count(&dest.conn, "items").unwrap(), 2);
        assert_eq!(dest.library_count().unwrap(), 0);
        assert_eq!(dest.clip_note(&local).unwrap(), "local note");
        assert_eq!(dest.payload(&local).unwrap()[0].data, vec![0, 255, 10, 13]);
        let events = count(&dest.conn, "events").unwrap();
        let again = dest.prepare_import(&file, false, None).unwrap();
        assert_eq!(again.preview.added_items, 0);
        dest.apply_import(again, false).unwrap();
        assert_eq!(count(&dest.conn, "events").unwrap(), events);
        assert_eq!(
            dest.list("", "snippets", 50, 0).unwrap()[0].note,
            "référence"
        );
    }
    #[test]
    fn corrupt_checksums_schemas_references_and_blobs_never_mutate_destination() {
        let f = Fixture::new();
        let mut source = memory();
        source.capture(&clip("saved", 1)).unwrap();
        let file = f.export(&source, false);
        let original = std::fs::read_to_string(&file).unwrap();
        let dest = memory();
        std::fs::write(&file, format!("{original}bad")).unwrap();
        assert!(dest
            .prepare_import(&file, false, None)
            .err()
            .unwrap()
            .contains("checksum"));
        for change in ["schema", "reference", "blob", "fingerprint"] {
            let mut lines = original.lines();
            let header = lines.next().unwrap();
            let mut record: serde_json::Value =
                serde_json::from_str(lines.next().unwrap()).unwrap();
            match change {
                "schema" => record["tables"]["items"]["columns"][0] = "unsafe_column".into(),
                "reference" => record["tables"]["events"]["rows"][0][1] = "missing".into(),
                "blob" => {
                    record["tables"]["representations"]["rows"] =
                        serde_json::json!([[id(&source,"saved"),"PNG",{"base64":"bad!"}]])
                }
                _ => record["tables"]["items"]["rows"][0][3] = "changed".into(),
            }
            std::fs::write(&file, format!("{header}\n{record}\n")).unwrap();
            std::fs::write(
                file.with_extension("jsonl.sha256"),
                archive_io::digest(&file).unwrap(),
            )
            .unwrap();
            assert!(
                dest.prepare_import(&file, false, None).is_err(),
                "accepted {change}"
            );
            assert_eq!(count(&dest.conn, "items").unwrap(), 0);
        }
    }
    #[test]
    fn older_portable_schema_gains_defaults_and_snippet_conflicts_are_preview_errors() {
        let f = Fixture::new();
        let mut source = memory();
        source.capture(&clip("legacy", 1)).unwrap();
        source
            .save_snippet(None, "same name", "text", "incoming", 1)
            .unwrap();
        let file = f.export(&source, false);
        let mut out = vec![];
        for (i, line) in std::fs::read_to_string(&file).unwrap().lines().enumerate() {
            if i == 0 {
                out.push(line.to_string());
                continue;
            }
            let mut snapshot: Snapshot = serde_json::from_str(line).unwrap();
            for name in ["items", "snippets"] {
                let table = snapshot.tables.get_mut(name).unwrap();
                table.columns.pop();
                for row in &mut table.rows {
                    row.pop();
                }
            }
            for name in ["library", "item_notes", "image_text", "labels"] {
                snapshot.tables.remove(name);
            }
            out.push(serde_json::to_string(&snapshot).unwrap());
        }
        std::fs::write(&file, out.join("\n")).unwrap();
        std::fs::write(
            file.with_extension("jsonl.sha256"),
            archive_io::digest(&file).unwrap(),
        )
        .unwrap();
        let mut dest = memory();
        let p = dest.prepare_import(&file, false, None).unwrap();
        dest.apply_import(p, false).unwrap();
        assert_eq!(dest.library_count().unwrap(), 1);
        assert_eq!(dest.list("legacy", "all", 50, 0).unwrap()[0].title, "");
        let conflict = memory();
        conflict
            .save_snippet(None, "same name", "text", "local", 1)
            .unwrap();
        assert!(conflict
            .prepare_import(&file, false, None)
            .err()
            .unwrap()
            .contains("conflict"));
        assert_eq!(count(&conflict.conn, "items").unwrap(), 0);
    }
    #[test]
    fn restore_requires_approval_and_retains_recovery_revisions_and_verified_rollback_backup() {
        let f = Fixture::new();
        let mut source = memory();
        source.capture(&clip("first", 1)).unwrap();
        let a = id(&source, "first");
        source.replace_item_text(&a, "edited", 3).unwrap();
        source.save_clip_note(&a, "searchableannotation").unwrap();
        source.capture(&clip("deleted", 4)).unwrap();
        let deleted = id(&source, "deleted");
        source.delete_with_recovery(&deleted, 5, 100).unwrap();
        source.clear_library().unwrap();
        let file = f.export(&source, true);
        let mut dest = memory();
        dest.capture(&clip("current", 1)).unwrap();
        let backup = f.0.join("before.sqlite").to_string_lossy().to_string();
        let p = dest
            .prepare_import(&file, true, Some(backup.clone()))
            .unwrap();
        assert!(dest.apply_import(p, false).is_err());
        assert!(!Path::new(&backup).exists());
        let p = dest
            .prepare_import(&file, true, Some(backup.clone()))
            .unwrap();
        dest.apply_import(p, true).unwrap();
        assert!(dest.list("current", "all", 50, 0).unwrap().is_empty());
        assert_eq!(
            dest.list("searchableannotation", "all", 50, 0)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(dest.library_count().unwrap(), 0);
        assert_eq!(count(&dest.conn, "item_revisions").unwrap(), 1);
        assert_eq!(count(&dest.conn, "library_clear_snapshot").unwrap(), 1);
        dest.undo_delete(&deleted, 6).unwrap();
        assert_eq!(dest.content(&deleted).unwrap().1, "deleted");
        assert_eq!(
            archive_io::digest(Path::new(&backup)).unwrap(),
            std::fs::read_to_string(Path::new(&backup).with_extension("sqlite.sha256")).unwrap()
        );
        let saved = Store::open(Path::new(&backup)).unwrap();
        assert_eq!(saved.list("current", "all", 50, 0).unwrap().len(), 1);
    }
    #[test]
    fn changed_archive_rejects_preview_and_write_failure_rolls_back_every_row() {
        let f = Fixture::new();
        let mut source = memory();
        source.capture(&clip("incoming", 1)).unwrap();
        let file = f.export(&source, false);
        let mut dest = memory();
        let p = dest.prepare_import(&file, false, None).unwrap();
        dest.capture(&clip("new capture", 2)).unwrap();
        assert!(dest
            .apply_import(p, false)
            .err()
            .unwrap()
            .contains("changed"));
        assert_eq!(count(&dest.conn, "items").unwrap(), 1);
        let p = dest.prepare_import(&file, false, None).unwrap();
        dest.conn.execute_batch("CREATE TRIGGER injected_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'simulated disk write failure'); END;").unwrap();
        assert!(dest.apply_import(p, false).is_err());
        assert_eq!(count(&dest.conn, "items").unwrap(), 1);
        assert_eq!(count(&dest.conn, "events").unwrap(), 1);
        dest.conn
            .execute_batch("DROP TRIGGER injected_failure")
            .unwrap();
        let sqlite = f.export(&source, true);
        let backup = f.0.join("failed-restore-before.sqlite");
        let prepared = dest
            .prepare_import(&sqlite, true, Some(backup.to_string_lossy().into()))
            .unwrap();
        dest.conn.execute_batch("CREATE TRIGGER injected_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'simulated replacement write failure'); END;").unwrap();
        assert!(dest.apply_import(prepared, true).is_err());
        assert_eq!(count(&dest.conn, "items").unwrap(), 1);
        assert_eq!(dest.list("new capture", "all", 50, 0).unwrap().len(), 1);
        archive_io::verify_sqlite(&backup).unwrap();
    }
    #[test]
    fn external_capture_invalidates_preview_and_queued_capture_resumes_after_restore() {
        let f = Fixture::new();
        let mut source = memory();
        source.capture(&clip("restored", 1)).unwrap();
        let file = f.export(&source, true);
        let path = f.0.join("live.sqlite");
        let mut dest = Store::open(&path).unwrap();
        let p = dest.prepare_import(&file, false, None).unwrap();
        {
            let mut external = Store::open(&path).unwrap();
            external.capture(&clip("external", 2)).unwrap();
        }
        assert!(dest.apply_import(p, false).is_err());
        let store = std::sync::Arc::new(std::sync::Mutex::new(dest));
        let mut guard = store.lock().unwrap();
        let p = guard
            .prepare_import(
                &file,
                true,
                Some(f.0.join("before.sqlite").to_string_lossy().into()),
            )
            .unwrap();
        let queued = store.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            tx.send(()).unwrap();
            queued
                .lock()
                .unwrap()
                .capture(&clip("queued capture", 3))
                .unwrap();
        });
        rx.recv().unwrap();
        guard.apply_import(p, true).unwrap();
        drop(guard);
        thread.join().unwrap();
        let store = store.lock().unwrap();
        assert_eq!(store.list("restored", "all", 50, 0).unwrap().len(), 1);
        assert_eq!(store.list("queued capture", "all", 50, 0).unwrap().len(), 1);
        assert!(store.list("external", "all", 50, 0).unwrap().is_empty());
    }
}
pub struct Prepared {
    pub preview: ImportPreview,
    stage: Store,
    stamp: (i64, u64),
}
fn count(conn: &Connection, table: &str) -> Result<u64> {
    conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| {
        r.get::<_, i64>(0).map(|n| n as u64)
    })
    .map_err(err)
}
fn stamp(conn: &Connection) -> Result<(i64, u64)> {
    Ok((
        conn.query_row("PRAGMA data_version", [], |r| r.get(0))
            .map_err(err)?,
        conn.total_changes(),
    ))
}
fn extras(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS item_revisions(item_id TEXT NOT NULL,text TEXT NOT NULL,replaced INTEGER NOT NULL);").map_err(err)
}
fn schema(conn: &Connection, table: &str) -> Result<Vec<(String, String, bool)>> {
    conn.prepare(&format!("PRAGMA table_info({table})"))
        .map_err(err)?
        .query_map([], |r| Ok((r.get(1)?, r.get(2)?, r.get::<_, i64>(3)? != 0)))
        .map_err(err)?
        .collect::<std::result::Result<_, _>>()
        .map_err(err)
}
fn values(
    table: &Table,
    row: &[serde_json::Value],
    types: &[(String, String, bool)],
) -> Result<Vec<Value>> {
    if row.len() != table.columns.len() {
        return Err("Archive row width does not match its columns".into());
    }
    row.iter()
        .zip(types)
        .map(|(v, (_, ty, required))| {
            let result = match (ty.as_str(), v) {
                (_, serde_json::Value::Null) if !required => Value::Null,
                ("INTEGER", serde_json::Value::Number(n)) => {
                    Value::Integer(n.as_i64().ok_or("Invalid archive integer")?)
                }
                ("TEXT", serde_json::Value::String(s)) => Value::Text(s.clone()),
                ("BLOB", serde_json::Value::Object(o)) if o.len() == 1 => Value::Blob(
                    STANDARD
                        .decode(
                            o.get("base64")
                                .and_then(|s| s.as_str())
                                .ok_or("Invalid archive blob")?,
                        )
                        .map_err(err)?,
                ),
                _ => return Err("Archive cell has an invalid type".into()),
            };
            Ok(result)
        })
        .collect()
}
fn load_snapshot(stage: &Store, mut snapshot: Snapshot, budget: &mut usize) -> Result<()> {
    if snapshot.version != 1 {
        return Err("Unsupported archive snapshot version".into());
    }
    for name in [
        "items",
        "events",
        "representations",
        "command_results",
        "snippets",
        "links",
    ] {
        if !snapshot.tables.contains_key(name) {
            return Err(format!("Incomplete archive snapshot: missing {name}"));
        }
    }
    let legacy_library = if !snapshot.tables.contains_key("library") {
        snapshot
            .tables
            .get("items")
            .map(|t| {
                t.rows
                    .iter()
                    .filter_map(|r| r.first().and_then(|v| v.as_str()).map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };
    for name in snapshot.tables.keys() {
        if !TABLES.contains(&name.as_str()) && !EXTRA.contains(&name.as_str()) {
            return Err(format!("Unknown archive table: {name}"));
        }
    }
    for name in TABLES.into_iter().chain(EXTRA) {
        let Some(mut table) = snapshot.tables.remove(name) else {
            continue;
        };
        // Earlier exports did not have display titles or separate snippet notes.
        if (name == "items" && !table.columns.iter().any(|s| s == "title"))
            || (name == "snippets" && !table.columns.iter().any(|s| s == "note"))
        {
            table
                .columns
                .push(if name == "items" { "title" } else { "note" }.into());
            for row in &mut table.rows {
                row.push("".into());
            }
        }
        let types = schema(&stage.conn, name)?;
        if table.columns != types.iter().map(|t| t.0.clone()).collect::<Vec<_>>() {
            return Err(format!("Unsupported {name} schema"));
        }
        *budget = budget
            .checked_add(table.rows.len())
            .ok_or("Archive row limit exceeded")?;
        if *budget > MAX_ROWS {
            return Err("Archive exceeds 250,000 rows".into());
        }
        let sql = format!(
            "INSERT INTO {name} VALUES({})",
            vec!["?"; types.len()].join(",")
        );
        let equal = format!(
            "SELECT EXISTS(SELECT 1 FROM {name} WHERE {})",
            table
                .columns
                .iter()
                .map(|c| format!("{c} IS ?"))
                .collect::<Vec<_>>()
                .join(" AND ")
        );
        for row in &table.rows {
            let row = values(&table, row, &types)?;
            // JSONL snapshots can repeat command results; only exact duplicate rows are accepted.
            if name != "item_revisions"
                && stage
                    .conn
                    .query_row(&equal, params_from_iter(&row), |r| r.get::<_, bool>(0))
                    .map_err(err)?
            {
                continue;
            }
            stage
                .conn
                .execute(&sql, params_from_iter(&row))
                .map_err(|e| format!("Invalid {name} record: {e}"))?;
        }
    }
    for id in legacy_library {
        stage
            .conn
            .execute("INSERT OR IGNORE INTO library VALUES(?)", [id])
            .map_err(err)?;
    }
    Ok(())
}
fn read_table(conn: &Connection, name: &str, bytes: &mut usize) -> Result<Table> {
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {name}"))
        .map_err(err)?;
    let columns = stmt
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    let mut cursor = stmt.query([]).map_err(err)?;
    let mut rows = vec![];
    while let Some(row) = cursor.next().map_err(err)? {
        if rows.len() >= MAX_ROWS {
            return Err("Archive row limit exceeded".into());
        }
        let mut cells = vec![];
        for i in 0..columns.len() {
            cells.push(match row.get_ref(i).map_err(err)? {
                ValueRef::Null => serde_json::Value::Null,
                ValueRef::Integer(n) => n.into(),
                ValueRef::Text(s) => {
                    *bytes += s.len();
                    String::from_utf8(s.to_vec()).map_err(err)?.into()
                }
                ValueRef::Blob(b) => {
                    *bytes += b.len();
                    serde_json::json!({"base64":STANDARD.encode(b)})
                }
                _ => return Err("Unsupported archive value".into()),
            });
            if *bytes > MAX_BYTES as usize {
                return Err("Archive decoded size limit exceeded".into());
            }
        }
        rows.push(cells);
    }
    Ok(Table { columns, rows })
}
fn validate(conn: &Connection) -> Result<()> {
    let broken: bool = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(err)?
        .query([])
        .map_err(err)?
        .next()
        .map_err(err)?
        .is_some();
    if broken {
        return Err("Archive has broken references".into());
    }
    let bad:i64=conn.query_row("SELECT (SELECT count(*) FROM labels WHERE kind NOT IN ('tag','collection') OR NOT EXISTS(SELECT 1 FROM items WHERE id=labels.item_id) AND NOT EXISTS(SELECT 1 FROM snippets WHERE 'snippet:'||id=labels.item_id)) + (SELECT count(*) FROM events WHERE repeats<1 OR last_seen<first_seen) + (SELECT count(*) FROM items WHERE id='' OR fingerprint='' OR kind NOT IN ('text','rich','image','files','command'))",[],|r|r.get(0)).map_err(err)?;
    if bad != 0 {
        return Err("Archive contains invalid identities, occurrences or labels".into());
    }
    let bad_ids:i64=conn.query_row("SELECT (SELECT count(*) FROM events WHERE id IS NULL OR id='' OR (sequence IS NOT NULL AND (session='' OR sequence<1))) + (SELECT count(*) FROM snippets WHERE id IS NULL OR id='' OR name='' OR kind NOT IN ('text','command')) + (SELECT count(*) FROM items WHERE id IS NULL OR pinned NOT IN (0,1))",[],|r|r.get(0)).map_err(err)?;
    if bad_ids != 0 {
        return Err("Archive contains invalid record identities".into());
    }
    let mut recovery_budget = 0;
    for row in conn
        .prepare("SELECT id,data FROM trash")
        .map_err(err)?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?
    {
        let (id, data) = row.map_err(err)?;
        let snapshot: Snapshot = serde_json::from_str(&data).map_err(err)?;
        let identities = snapshot
            .tables
            .get("items")
            .into_iter()
            .flat_map(|t| {
                t.rows
                    .iter()
                    .filter_map(|r| r.first().and_then(|v| v.as_str()).map(str::to_string))
            })
            .chain(snapshot.tables.get("snippets").into_iter().flat_map(|t| {
                t.rows.iter().filter_map(|r| {
                    r.first()
                        .and_then(|v| v.as_str())
                        .map(|s| format!("snippet:{s}"))
                })
            }))
            .collect::<Vec<_>>();
        if identities != vec![id] {
            return Err("Recovery record identity mismatch".into());
        }
        if snapshot
            .tables
            .keys()
            .any(|k| !TABLES.contains(&k.as_str()))
        {
            return Err("Invalid recovery tables".into());
        }
        let recovery = Store::open(Path::new(":memory:"))?;
        extras(&recovery.conn)?;
        recovery
            .conn
            .execute_batch("BEGIN; PRAGMA defer_foreign_keys=ON;")
            .map_err(err)?;
        load_snapshot(&recovery, snapshot, &mut recovery_budget)?;
        // Recovery data is independently validated and cannot nest more recovery data.
        validate(&recovery.conn)?;
    }
    let mut items = conn
        .prepare("SELECT id,fingerprint,kind,text FROM items")
        .map_err(err)?;
    let records = items
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(err)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(err)?;
    for (id, fingerprint, kind, text) in records {
        let representations = conn
            .prepare("SELECT format,data FROM representations WHERE item_id=?")
            .map_err(err)?
            .query_map([id], |r| {
                Ok(crate::store::Representation {
                    format: r.get(0)?,
                    data: r.get(1)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let expected = crate::store::capture_fingerprint(&crate::store::Capture {
            kind,
            text,
            source: String::new(),
            timestamp: 0,
            directory: String::new(),
            session: String::new(),
            sequence: None,
            representations,
        });
        if fingerprint != expected {
            return Err("Archive content fingerprint mismatch".into());
        }
    }
    for row in conn
        .prepare("SELECT data FROM saved_searches")
        .map_err(err)?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(err)?
    {
        let search: crate::search::SavedSearch =
            serde_json::from_str(&row.map_err(err)?).map_err(err)?;
        search.options.validate()?;
    }
    Ok(())
}
fn reindex(conn: &Connection) -> Result<()> {
    conn.execute_batch("DELETE FROM search; DELETE FROM item_terms; DELETE FROM fuzzy_keys; DELETE FROM terms; DELETE FROM thumbnails;").map_err(err)?;
    let records=conn.prepare("SELECT i.id,i.text||' '||i.title||' '||COALESCE(o.text,'') FROM items i LEFT JOIN image_text o ON o.item_id=i.id UNION ALL SELECT 'snippet:'||id,name||' '||text||' '||note FROM snippets").map_err(err)?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(err)?.collect::<std::result::Result<Vec<_>,_>>().map_err(err)?;
    for (id, text) in records {
        conn.execute("INSERT INTO search(item_id,text) VALUES(?,?)", [&id, &text])
            .map_err(err)?;
        crate::search::index(conn, &id, &text)?;
    }
    Ok(())
}
fn merge(conn: &Connection, stage: &Store, replacement: bool) -> Result<()> {
    let mut ids = BTreeMap::<String, String>::new();
    let mut new_ids = std::collections::BTreeSet::new();
    if replacement {
        conn.execute_batch("DELETE FROM events; DELETE FROM representations; DELETE FROM links; DELETE FROM labels; DELETE FROM image_text; DELETE FROM item_notes; DELETE FROM library; DELETE FROM library_clear_snapshot; DELETE FROM items; DELETE FROM snippets; DELETE FROM command_results; DELETE FROM saved_searches; DELETE FROM trash; DELETE FROM item_revisions;").map_err(err)?;
    }
    let mut bytes = 0;
    for name in TABLES
        .into_iter()
        .chain(if replacement { EXTRA.to_vec() } else { vec![] })
    {
        let table = read_table(&stage.conn, name, &mut bytes)?;
        for raw in &table.rows {
            let mut row = values(&table, raw, &schema(conn, name)?)?;
            if name == "items" && !replacement {
                let old = raw[0].as_str().ok_or("Invalid item ID")?.to_string();
                let existing: Option<String> = conn
                    .query_row(
                        "SELECT id FROM items WHERE fingerprint=?",
                        [raw[1].as_str().ok_or("Invalid fingerprint")?],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?;
                if let Some(existing) = existing {
                    ids.insert(old, existing);
                    continue;
                }
                let collision: bool = conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM items WHERE id=?)",
                        [&old],
                        |r| r.get(0),
                    )
                    .map_err(err)?;
                let id = if collision {
                    uuid::Uuid::new_v4().to_string()
                } else {
                    old.clone()
                };
                ids.insert(old, id.clone());
                new_ids.insert(id.clone());
                row[0] = Value::Text(id);
            } else if let Some(i) = table.columns.iter().position(|c| c == "item_id") {
                if let Some(id) = raw[i].as_str().and_then(|id| ids.get(id)) {
                    row[i] = Value::Text(id.clone());
                }
                if name == "library"
                    && !replacement
                    && !new_ids.contains(match &row[i] {
                        Value::Text(s) => s,
                        _ => return Err("Invalid item reference".into()),
                    })
                {
                    continue;
                }
            }
            let equal = format!(
                "SELECT EXISTS(SELECT 1 FROM {name} WHERE {})",
                table
                    .columns
                    .iter()
                    .map(|c| format!("{c} IS ?"))
                    .collect::<Vec<_>>()
                    .join(" AND ")
            );
            if name != "item_revisions"
                && conn
                    .query_row(&equal, params_from_iter(&row), |r| r.get::<_, bool>(0))
                    .map_err(err)?
            {
                continue;
            }
            // Existing destination metadata wins when merging identical content.
            let keep_local = ["links", "image_text", "item_notes", "labels", "library"]
                .contains(&name)
                && !replacement;
            let sql = format!(
                "INSERT {} INTO {name} VALUES({})",
                if keep_local { "OR IGNORE" } else { "" },
                vec!["?"; row.len()].join(",")
            );
            conn.execute(&sql, params_from_iter(&row)).map_err(|e| {
                format!(
                    "{name} conflict; nothing imported. Resolve the conflicting record first: {e}"
                )
            })?;
        }
    }
    validate(conn)?;
    reindex(conn)
}
use rusqlite::OptionalExtension;
impl Store {
    pub fn prepare_import(
        &self,
        path: &Path,
        replacement: bool,
        backup_path: Option<String>,
    ) -> Result<Prepared> {
        let before = stamp(&self.conn)?;
        if !path.is_absolute() {
            return Err("Choose an absolute archive path".into());
        }
        if std::fs::metadata(path).map_err(err)?.len() > MAX_BYTES {
            return Err("Archive exceeds 256 MiB".into());
        }
        let mut magic = [0u8; 16];
        let sqlite = std::fs::File::open(path)
            .map_err(err)?
            .read_exact(&mut magic)
            .is_ok()
            && &magic == b"SQLite format 3\0";
        if replacement && !sqlite {
            return Err("Replacement requires a verified SQLite backup".into());
        }
        let checksum = archive_io::digest(path)?;
        let mut manifest = String::new();
        std::fs::File::open(path.with_extension(if sqlite {
            "sqlite.sha256"
        } else {
            "jsonl.sha256"
        }))
        .map_err(|_| "Adjacent checksum file is required")?
        .take(1024)
        .read_to_string(&mut manifest)
        .map_err(err)?;
        if manifest.trim() != checksum {
            return Err("Archive checksum mismatch".into());
        }
        let stage = Store::open(Path::new(":memory:"))?;
        extras(&stage.conn)?;
        stage
            .conn
            .execute_batch("BEGIN; PRAGMA defer_foreign_keys=ON;")
            .map_err(err)?;
        let mut budget = 0;
        if sqlite {
            for suffix in ["-wal", "-journal"] {
                if Path::new(&format!("{}{suffix}", path.display())).exists() {
                    return Err("Use a closed SQLite backup, not a live database".into());
                }
            }
            archive_io::verify_sqlite(path)?;
            let source =
                Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(err)?;
            let version: i64 = source
                .query_row("PRAGMA user_version", [], |r| r.get(0))
                .map_err(err)?;
            if version > 2 {
                return Err("Backup is from a newer unsupported archive schema".into());
            }
            let mut tables = BTreeMap::new();
            let mut bytes = 0;
            for name in TABLES.into_iter().chain(EXTRA) {
                let sql: Option<String> = source
                    .query_row(
                        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                        [name],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?;
                if let Some(sql) = sql {
                    if !sql.to_uppercase().starts_with("CREATE TABLE") {
                        return Err("Unsupported backup table".into());
                    }
                    tables.insert(name.into(), read_table(&source, name, &mut bytes)?);
                }
            }
            load_snapshot(&stage, Snapshot { version: 1, tables }, &mut budget)?;
        } else {
            let mut reader = BufReader::new(std::fs::File::open(path).map_err(err)?);
            let mut header = String::new();
            reader
                .by_ref()
                .take(1025)
                .read_line(&mut header)
                .map_err(err)?;
            let h: serde_json::Value = serde_json::from_str(&header).map_err(err)?;
            if h != serde_json::json!({"archiverExport":1,"blobs":"base64","recoveryIncluded":false})
            {
                return Err("Unsupported portable archive header".into());
            }
            loop {
                let mut line = String::new();
                let n = reader
                    .by_ref()
                    .take(32 * 1024 * 1024 + 1)
                    .read_line(&mut line)
                    .map_err(err)?;
                if n == 0 {
                    break;
                }
                if n > 32 * 1024 * 1024 {
                    return Err("Archive line exceeds 32 MiB".into());
                }
                let snapshot: Snapshot = serde_json::from_str(&line).map_err(err)?;
                if snapshot
                    .tables
                    .keys()
                    .any(|k| !TABLES.contains(&k.as_str()))
                {
                    return Err("Portable archives contain unsupported tables".into());
                }
                load_snapshot(&stage, snapshot, &mut budget)?;
            }
        }
        validate(&stage.conn)?;
        stage.conn.execute_batch("COMMIT;").map_err(err)?;
        if archive_io::digest(path)? != checksum {
            return Err("Archive changed during validation".into());
        }
        // Dry-run on a private copy: preview never mutates the live archive or its change counter.
        let mut trial = Store::open(Path::new(":memory:"))?;
        rusqlite::backup::Backup::new(&self.conn, &mut trial.conn)
            .map_err(err)?
            .run_to_completion(128, std::time::Duration::from_millis(5), None)
            .map_err(err)?;
        extras(&trial.conn)?;
        let current = count(&self.conn, "items")?;
        let tx = trial
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(err)?;
        merge(&tx, &stage, replacement)?;
        let after = count(&tx, "items")?;
        tx.commit().map_err(err)?;
        if replacement {
            let backup = backup_path
                .as_ref()
                .ok_or("Choose a new absolute pre-restore backup path")?;
            if !Path::new(backup).is_absolute()
                || Path::new(backup).exists()
                || Path::new(backup).with_extension("sqlite.sha256").exists()
            {
                return Err("Choose a new absolute pre-restore backup path".into());
            }
        }
        if stamp(&self.conn)? != before {
            return Err("Archive changed while previewing; try again".into());
        }
        Ok(Prepared {
            preview: ImportPreview {
                token: uuid::Uuid::new_v4().to_string(),
                checksum,
                replacement,
                items: count(&stage.conn, "items")?,
                snippets: count(&stage.conn, "snippets")?,
                occurrences: count(&stage.conn, "events")?,
                current_items: current,
                current_snippets: count(&self.conn, "snippets")?,
                current_occurrences: count(&self.conn, "events")?,
                added_items: after.saturating_sub(current),
                backup_path,
            },
            stage,
            stamp: stamp(&self.conn)?,
        })
    }
    pub fn apply_import(&mut self, prepared: Prepared, approved: bool) -> Result<ImportPreview> {
        if prepared.preview.replacement && !approved {
            return Err("Explicit replacement approval is required".into());
        }
        if stamp(&self.conn)? != prepared.stamp {
            return Err("Archive changed after preview; check the import again".into());
        }
        if let Some(path) = prepared
            .preview
            .backup_path
            .as_ref()
            .filter(|_| prepared.preview.replacement)
        {
            let path = Path::new(path);
            let checksum = self.backup_verified(path)?;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path.with_extension("sqlite.sha256"))
                .map_err(err)?;
            std::io::Write::write_all(&mut file, checksum.as_bytes()).map_err(err)?;
            file.sync_all().map_err(err)?;
        }
        // Logical restore keeps SQLite handles valid. IMMEDIATE serializes external writers;
        // the app's shared store mutex queues capture writes until this transaction commits.
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(err)?;
        if stamp(&tx)? != prepared.stamp {
            return Err("Archive changed after preview; check the import again".into());
        }
        extras(&tx)?;
        merge(&tx, &prepared.stage, prepared.preview.replacement)?;
        tx.commit().map_err(err)?;
        Ok(prepared.preview)
    }
}
