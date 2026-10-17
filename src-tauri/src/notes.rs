//! Searchable annotations are metadata; never part of capture identity or delivery.
use crate::store::{Result, Store};
use rusqlite::{params, Connection};

pub fn initialize(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS item_notes(item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,note TEXT NOT NULL);").map_err(|e| e.to_string())
}
impl Store {
    pub fn clip_note(&self, id: &str) -> Result<String> {
        self.content(id)?;
        self.conn.query_row("SELECT COALESCE((SELECT note FROM item_notes WHERE item_id=?),'')", [id], |r| r.get(0)).map_err(|e| e.to_string())
    }
    pub fn save_clip_note(&self, id: &str, note: &str) -> Result<()> {
        if id.starts_with("snippet:") || note.chars().count() > 10000 {
            return Err("Clip notes require an archived item and at most 10,000 characters".into());
        }
        let (_, text) = self.content(id)?;
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        if note.is_empty() {
            tx.execute("DELETE FROM item_notes WHERE item_id=?", [id]).map_err(|e| e.to_string())?;
        } else {
            tx.execute("INSERT INTO item_notes VALUES(?,?) ON CONFLICT(item_id) DO UPDATE SET note=excluded.note", params![id, note]).map_err(|e| e.to_string())?;
        }
        let extra: String = tx.query_row("SELECT title||' '||COALESCE((SELECT text FROM image_text WHERE item_id=items.id),'') FROM items WHERE id=?", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
        crate::search::index(&tx, id, &format!("{extra} {text}"))?;
        tx.commit().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{search::SearchOptions, store::Capture};
    #[test]
    fn notes_preserve_search_payloads_revisions_export_backup_and_recovery() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("target/test-temp");
        std::fs::create_dir_all(&path).unwrap();
        let path = path.join(format!("notes-{}.sqlite", uuid::Uuid::new_v4()));
        let mut s = Store::open(&path).unwrap();
        let capture = Capture { kind: "text".into(), text: "original".into(), source: "test".into(), timestamp: 1, directory: "".into(), session: "".into(), sequence: None, representations: vec![] };
        s.capture(&capture).unwrap();
        let id = s.list("", "all", 50, 0).unwrap()[0].id.clone();
        s.save_clip_note(&id, "orbitalreference 🛰").unwrap();
        assert_eq!(s.list("orbitalreference", "all", 50, 0).unwrap().len(), 1);
        let opts = SearchOptions { fuzzy: true, ..Default::default() };
        assert_eq!(s.search_items("orbitalreferenc", "all", 50, 0, "", &opts).unwrap().len(), 1);
        s.capture(&capture).unwrap();
        s.rename_item(&id, "Renamed").unwrap();
        assert_eq!(s.content(&id).unwrap().1, "original");
        s.replace_item_text(&id, "edited payload", 9).unwrap();
        assert_eq!(s.search_items("orbitalreferenc", "all", 50, 0, "", &opts).unwrap().len(), 1);
        s.delete_with_recovery(&id, 10, 100).unwrap();
        s.undo_delete(&id, 11).unwrap();
        assert_eq!(s.clip_note(&id).unwrap(), "orbitalreference 🛰");
        let export = path.with_extension("jsonl");
        s.export_jsonl(&export).unwrap();
        assert!(std::fs::read_to_string(&export).unwrap().contains("orbitalreference"));
        let backup = path.with_extension("backup.sqlite");
        s.backup_verified(&backup).unwrap();
        {
            let saved = Store::open(&backup).unwrap();
            assert_eq!(saved.clip_note(&id).unwrap(), "orbitalreference 🛰");
        }
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(s.clip_note(&id).unwrap(), "orbitalreference 🛰");
        assert_eq!(s.list("orbitalreference", "all", 50, 0).unwrap().len(), 1);
        s.save_clip_note(&id, "").unwrap();
        assert!(s.search_items("orbitalreference", "all", 50, 0, "", &opts).unwrap().is_empty());
        assert!(s.list("orbitalreference", "all", 50, 0).unwrap().is_empty());
        assert!(s.save_clip_note(&id, &"x".repeat(10001)).is_err());
        assert!(s.save_clip_note("missing", "note").is_err());
        drop(s);
        for file in [path, export.clone(), export.with_extension("jsonl.sha256"), backup] {
            if file.exists() { std::fs::remove_file(file).unwrap(); }
        }
    }
}
