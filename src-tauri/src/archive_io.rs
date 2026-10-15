use crate::store::{Result, Store};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{
    params,
    types::{Value, ValueRef},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::Path,
};
#[derive(Serialize, Deserialize)]
pub struct Snapshot {
    version: u32,
    tables: BTreeMap<String, Table>,
}
#[derive(Serialize, Deserialize)]
struct Table {
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
}
// library_clear_snapshot is local visibility-undo state: full SQLite backups include it,
// portable exports and per-item deletion recovery intentionally do not.
const TABLES: [&str; 9] = [
    "items",
    "events",
    "representations",
    "command_results",
    "snippets",
    "links",
    "labels",
    "image_text",
    "library",
];
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
impl Store {
    pub fn snapshot(&self, id: Option<&str>) -> Result<Snapshot> {
        let mut tables = BTreeMap::new();
        for table in TABLES {
            let clause=match table {"items"=>"id=?","snippets"=>"id=?","command_results"=>"EXISTS(SELECT 1 FROM events e WHERE e.item_id=? AND e.session=command_results.session AND e.sequence=command_results.sequence)",_=>"item_id=?"};
            let sql = if id.is_some() {
                format!("SELECT * FROM {table} WHERE {clause}")
            } else {
                format!("SELECT * FROM {table}")
            };
            let mut stmt = self.conn.prepare(&sql).map_err(err)?;
            let columns = stmt
                .column_names()
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>();
            let n = columns.len();
            let snippet = id.and_then(|id| id.strip_prefix("snippet:"));
            let argument = if table == "labels" {
                id.unwrap_or("")
            } else if table == "snippets" {
                snippet.unwrap_or("")
            } else if snippet.is_some() {
                ""
            } else {
                id.unwrap_or("")
            };
            let mut cursor = if id.is_some() {
                stmt.query([argument])
            } else {
                stmt.query([])
            }
            .map_err(err)?;
            let mut rows = Vec::new();
            while let Some(row) = cursor.next().map_err(err)? {
                let mut values = Vec::new();
                for index in 0..n {
                    values.push(match row.get_ref(index).map_err(err)? {
                        ValueRef::Null => serde_json::Value::Null,
                        ValueRef::Integer(i) => i.into(),
                        ValueRef::Real(f) => serde_json::json!(f),
                        ValueRef::Text(t) => String::from_utf8(t.to_vec()).map_err(err)?.into(),
                        ValueRef::Blob(b) => serde_json::json!({"base64":STANDARD.encode(b)}),
                    });
                }
                rows.push(values);
            }
            tables.insert(table.into(), Table { columns, rows });
        }
        Ok(Snapshot { version: 1, tables })
    }
    pub fn recovery_items(&self, now: i64) -> Result<Vec<(String, i64)>> {
        self.conn
            .execute("DELETE FROM trash WHERE expires<=?", [now])
            .map_err(err)?;
        let mut stmt = self
            .conn
            .prepare("SELECT id,expires FROM trash ORDER BY expires DESC")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(rows)
    }
    pub fn purge_recovery(&self, now: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM trash WHERE expires<=?", [now])
            .map_err(err)?;
        Ok(())
    }
    pub fn external_changes(&self) -> Result<i64> {
        self.conn
            .query_row("PRAGMA data_version", [], |r| r.get(0))
            .map_err(err)
    }
    pub fn undo_delete(&mut self, id: &str, now: i64) -> Result<()> {
        let data: String = self
            .conn
            .query_row(
                "SELECT data FROM trash WHERE id=? AND expires>?",
                params![id, now],
                |r| r.get(0),
            )
            .map_err(|_| "Recovery window expired or no recoverable deletion".to_string())?;
        let mut snapshot: Snapshot = serde_json::from_str(&data).map_err(err)?;
        if snapshot.version != 1 {
            return Err("Unsupported recovery format".into());
        }
        let tx = self.conn.transaction().map_err(err)?;
        // A copy of this content may have been captured again after deletion. Merge
        // restored events into that item while retaining its newer occurrences.
        if let Some(table) = snapshot.tables.get_mut("items") {
            for row in &mut table.rows {
                let fingerprint = row[1].as_str().ok_or("Invalid recovery fingerprint")?;
                if let Ok(existing) = tx.query_row(
                    "SELECT id FROM items WHERE fingerprint=?",
                    [fingerprint],
                    |r| r.get::<_, String>(0),
                ) {
                    row[0] = existing.into();
                }
            }
        }
        let restored_id = snapshot.tables["items"]
            .rows
            .first()
            .and_then(|r| r[0].as_str())
            .map(str::to_string);
        for name in TABLES {
            let Some(table) = snapshot.tables.get_mut(name) else {
                if name == "labels" || name == "image_text" || name == "library" {
                    continue;
                } // Recovery records created before labels remain usable.
                return Err("Incomplete recovery record".into());
            };
            let stmt = tx
                .prepare(&format!("SELECT * FROM {name} LIMIT 0"))
                .map_err(err)?;
            let expected = stmt
                .column_names()
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>();
            drop(stmt);
            // Older recovery records omit the added snippet note or history display title.
            if ["snippets", "items"].contains(&name)
                && table.columns == expected[..expected.len() - 1]
                && expected
                    .last()
                    .is_some_and(|c| c == if name == "items" { "title" } else { "note" })
            {
                table.columns = expected.clone();
                for row in &mut table.rows {
                    row.push("".into());
                }
            }
            if table.columns != expected {
                return Err("Recovery schema mismatch".into());
            }
            let sql = format!(
                "INSERT OR IGNORE INTO {name} VALUES({})",
                vec!["?"; expected.len()].join(",")
            );
            for row in &mut table.rows {
                if row.len() != expected.len() {
                    return Err("Invalid recovery row".into());
                }
                if let Some(ref restored) = restored_id {
                    if let Some(column) = expected.iter().position(|c| c == "item_id") {
                        row[column] = restored.clone().into();
                    }
                }
                let values = row
                    .iter()
                    .map(|value| {
                        Ok(match value {
                            serde_json::Value::Null => Value::Null,
                            serde_json::Value::String(s) => Value::Text(s.clone()),
                            serde_json::Value::Number(n) => {
                                Value::Integer(n.as_i64().ok_or("Invalid recovery number")?)
                            }
                            serde_json::Value::Object(o) => Value::Blob(
                                STANDARD
                                    .decode(
                                        o.get("base64")
                                            .and_then(|v| v.as_str())
                                            .ok_or("Invalid recovery blob")?,
                                    )
                                    .map_err(err)?,
                            ),
                            _ => return Err("Invalid recovery value".into()),
                        })
                    })
                    .collect::<Result<Vec<_>>>()?;
                if name == "snippets" {
                    let changed = tx
                        .execute(&sql, rusqlite::params_from_iter(&values))
                        .map_err(err)?;
                    if changed == 0 {
                        return Err(
                            "A snippet with this name already exists; rename it before restoring"
                                .into(),
                        );
                    }
                } else {
                    tx.execute(&sql, rusqlite::params_from_iter(&values))
                        .map_err(err)?;
                }
            }
        }
        if let Some(id) = restored_id {
            tx.execute("INSERT INTO search(item_id,text) SELECT id,text FROM items WHERE id=? AND NOT EXISTS(SELECT 1 FROM search WHERE item_id=?)",params![id,id]).map_err(err)?;
            let text: String = tx
                .query_row(
                    "SELECT title||' '||text FROM items WHERE id=?",
                    [&id],
                    |r| r.get(0),
                )
                .map_err(err)?;
            let ocr: String = tx
                .query_row("SELECT text FROM image_text WHERE item_id=?", [&id], |r| {
                    r.get(0)
                })
                .unwrap_or_default();
            crate::search::index(&tx, &id, &format!("{text} {ocr}"))?;
        } else if let Some(snippet_id) = id.strip_prefix("snippet:") {
            let text: String = tx
                .query_row(
                    "SELECT name||' '||text FROM snippets WHERE id=?",
                    [snippet_id],
                    |r| r.get(0),
                )
                .map_err(err)?;
            crate::search::index(&tx, id, &text)?;
        }
        tx.execute("DELETE FROM trash WHERE id=?", [id])
            .map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn export_jsonl(&self, path: &Path) -> Result<String> {
        // Keep every exported item in the same read snapshot while CLI writers continue.
        let snapshot = self.conn.unchecked_transaction().map_err(err)?;
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(err)?;
        let mut out = std::io::BufWriter::new(file);
        out.write_all(b"{\"archiverExport\":1,\"blobs\":\"base64\",\"recoveryIncluded\":false}\n")
            .map_err(err)?;
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM items UNION ALL SELECT 'snippet:'||id FROM snippets")
            .map_err(err)?;
        let mut rows = stmt.query([]).map_err(err)?;
        while let Some(row) = rows.next().map_err(err)? {
            let id: String = row.get(0).map_err(err)?;
            serde_json::to_writer(&mut out, &self.snapshot(Some(&id))?).map_err(err)?;
            out.write_all(b"\n").map_err(err)?;
        }
        out.flush().map_err(err)?;
        out.get_ref().sync_all().map_err(err)?;
        snapshot.commit().map_err(err)?;
        digest(path)
    }
    pub fn backup_verified(&self, path: &Path) -> Result<String> {
        if path.exists() {
            return Err("Choose a new backup filename; existing files are preserved".into());
        }
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(err)?;
        self.conn.backup("main", path, None).map_err(err)?;
        verify_sqlite(path)?;
        digest(path)
    }
}
pub fn digest(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path).map_err(err)?;
    let mut hash = Sha256::new();
    let mut chunk = [0u8; 65536];
    loop {
        let n = file.read(&mut chunk).map_err(err)?;
        if n == 0 {
            break;
        }
        hash.update(&chunk[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
pub fn verify_sqlite(path: &Path) -> Result<()> {
    let conn =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(err)?;
    for table in TABLES {
        if table == "labels" || table == "image_text" || table == "library" {
            continue;
        }
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?)",
                [table],
                |row| row.get(0),
            )
            .map_err(err)?;
        if !exists {
            return Err(format!("Not an Archiver backup: missing {table}"));
        }
    }
    let check: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(err)?;
    if check != "ok" {
        return Err(format!("Backup integrity failed: {check}"));
    }
    let mut stmt = conn.prepare("PRAGMA foreign_key_check").map_err(err)?;
    if stmt.query([]).map_err(err)?.next().map_err(err)?.is_some() {
        return Err("Backup has broken foreign keys".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Capture;
    #[test]
    fn pin_titles_export_and_old_item_recovery_remains_compatible() {
        let mut s = Store::open(Path::new(":memory:")).unwrap();
        s.capture(&Capture {
            kind: "text".into(),
            text: "payload".into(),
            source: "test".into(),
            timestamp: 1,
            directory: "".into(),
            session: "".into(),
            sequence: None,
            representations: vec![],
        })
        .unwrap();
        let id = s.list("", "all", 50, 0).unwrap()[0].id.clone();
        s.rename_item(&id, "Reference").unwrap();
        let snapshot = s.snapshot(Some(&id)).unwrap();
        let items = &snapshot.tables["items"];
        let title = items.columns.iter().position(|c| c == "title").unwrap();
        assert_eq!(items.rows[0][title], "Reference");
        s.delete_with_recovery(&id, 2, 100).unwrap();
        let data: String = s
            .conn
            .query_row("SELECT data FROM trash WHERE id=?", [&id], |r| r.get(0))
            .unwrap();
        let mut old: Snapshot = serde_json::from_str(&data).unwrap();
        let table = old.tables.get_mut("items").unwrap();
        assert_eq!(table.columns.pop().unwrap(), "title");
        for row in &mut table.rows {
            row.pop();
        }
        s.conn
            .execute(
                "UPDATE trash SET data=? WHERE id=?",
                params![serde_json::to_string(&old).unwrap(), id],
            )
            .unwrap();
        s.undo_delete(&id, 3).unwrap();
        let restored = s.list("", "all", 50, 0).unwrap().remove(0);
        assert_eq!(restored.text, "payload");
        assert_eq!(restored.title, "");
    }
    #[test]
    fn snippet_notes_migrate_persist_export_and_recover_old_records() {
        let root = std::env::temp_dir().join(format!("archiver-notes-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("archive.sqlite");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE snippets(id TEXT PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0);").unwrap();
        drop(conn);
        let mut s = Store::open(&path).unwrap();
        let id = s
            .save_snippet_with_note(
                None,
                "Original name",
                "text",
                "Paste only this",
                Some("Note: café 😀"),
                1,
            )
            .unwrap();
        s.save_snippet(Some(&id), "Renamed", "text", "Paste only this", 2)
            .unwrap();
        assert_eq!(
            s.list("", "snippets", 50, 0).unwrap()[0].note,
            "Note: café 😀"
        );
        assert_eq!(s.content(&id).unwrap().1, "Paste only this");
        let snapshot = s.snapshot(None).unwrap();
        assert_eq!(snapshot.tables["snippets"].columns.last().unwrap(), "note");
        s.delete_with_recovery(&id, 10, 100).unwrap();
        s.undo_delete(&id, 11).unwrap();
        assert_eq!(
            s.list("", "snippets", 50, 0).unwrap()[0].note,
            "Note: café 😀"
        );
        s.delete_with_recovery(&id, 12, 100).unwrap();
        // Simulate the seven-column recovery record made by an earlier release.
        let data: String = s
            .conn
            .query_row("SELECT data FROM trash WHERE id=?", [&id], |r| r.get(0))
            .unwrap();
        let mut old: Snapshot = serde_json::from_str(&data).unwrap();
        let table = old.tables.get_mut("snippets").unwrap();
        table.columns.pop();
        for row in &mut table.rows {
            row.pop();
        }
        s.conn
            .execute(
                "UPDATE trash SET data=? WHERE id=?",
                params![serde_json::to_string(&old).unwrap(), id],
            )
            .unwrap();
        s.undo_delete(&id, 13).unwrap();
        assert_eq!(s.list("", "snippets", 50, 0).unwrap()[0].note, "");
        s.save_snippet_with_note(
            Some(&id),
            "Renamed",
            "text",
            "Paste only this",
            Some("Durable note"),
            14,
        )
        .unwrap();
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(
            s.list("", "snippets", 50, 0).unwrap()[0].note,
            "Durable note"
        );
        assert!(s
            .save_snippet_with_note(
                Some(&id),
                "Renamed",
                "text",
                "Paste only this",
                Some(&"x".repeat(10001)),
                15
            )
            .is_err());
        drop(s);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn recovery_is_explicit_and_merges_recaptures() {
        let mut store = Store::open(Path::new(":memory:")).unwrap();
        let mut c = Capture {
            kind: "text".into(),
            text: "recover me".into(),
            source: "test".into(),
            timestamp: 1,
            directory: String::new(),
            session: String::new(),
            sequence: None,
            representations: vec![],
        };
        store.capture(&c).unwrap();
        let id = store.list("", "all", 1, 0).unwrap()[0].id.clone();
        store.delete(&id).unwrap();
        assert!(store.recovery_items(1).unwrap().is_empty());
        store.capture(&c).unwrap();
        let id = store.list("", "all", 1, 0).unwrap()[0].id.clone();
        store.delete_with_recovery(&id, 10, 100).unwrap();
        c.timestamp = 5000;
        store.capture(&c).unwrap();
        store.undo_delete(&id, 20).unwrap();
        assert_eq!(store.stats().unwrap().items, 1);
        assert_eq!(store.stats().unwrap().occurrences, 2);
        let id = store.list("", "all", 1, 0).unwrap()[0].id.clone();
        store.delete_with_recovery(&id, 20, 100).unwrap();
        assert!(store.undo_delete(&id, 120).is_err());
        assert!(store.recovery_items(120).unwrap().is_empty());
    }
    #[test]
    fn backup_and_export_are_verified_and_do_not_overwrite() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("target");
        std::fs::create_dir_all(&root).unwrap();
        let base = root.join(uuid::Uuid::new_v4().to_string());
        let store = Store::open(Path::new(":memory:")).unwrap();
        let hash = store.backup_verified(&base).unwrap();
        assert_eq!(hash, digest(&base).unwrap());
        assert!(store.backup_verified(&base).is_err());
        let export = base.with_extension("jsonl");
        store.export_jsonl(&export).unwrap();
        assert!(store.export_jsonl(&export).is_err());
        std::fs::remove_file(base).unwrap();
        std::fs::remove_file(export).unwrap();
    }
}
