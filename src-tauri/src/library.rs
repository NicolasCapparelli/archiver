//! Library membership is a view of durable archive items, never a deletion rule.
use crate::store::{Result, Store};
pub fn initialize(conn: &rusqlite::Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS library(item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS library_state(key TEXT PRIMARY KEY);").map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS library_clear_snapshot(item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE);").map_err(|e| e.to_string())?;
    if tx
        .execute(
            "INSERT OR IGNORE INTO library_state VALUES('initialized')",
            [],
        )
        .map_err(|e| e.to_string())?
        == 1
    {
        tx.execute("INSERT OR IGNORE INTO library SELECT id FROM items", [])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
impl Store {
    pub fn clear_library(&self) -> Result<usize> {
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM library", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        if count > 0 {
            tx.execute_batch("DELETE FROM library_clear_snapshot; INSERT INTO library_clear_snapshot SELECT item_id FROM library; DELETE FROM library;").map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(count as usize)
    }
    pub fn undo_library_clear(&self) -> Result<usize> {
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let count = tx.execute("INSERT OR IGNORE INTO library SELECT s.item_id FROM library_clear_snapshot s JOIN items i ON i.id=s.item_id", []).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(count)
    }
    pub fn library_count(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM library", [], |r| r.get(0))
            .map_err(|e| e.to_string())
    }
    pub fn restore_library_item(&self, id: &str) -> Result<()> {
        if id.starts_with("snippet:") {
            return Err("Named snippets are always available separately".into());
        }
        self.content(id)?;
        self.conn
            .execute("INSERT OR IGNORE INTO library VALUES(?)", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{search::SearchOptions, store::Capture};
    #[test]
    fn undo_clear_merges_survives_restart_and_never_revives_deleted_items() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("target").join(format!("undo-clear-{}.sqlite", uuid::Uuid::new_v4()));
        let capture = |text: &str, timestamp| Capture { kind: "text".into(), text: text.into(), source: "test".into(), timestamp, directory: "".into(), session: "".into(), sequence: None, representations: vec![] };
        {
            let mut s = Store::open(&path).unwrap();
            s.capture(&capture("keep", 1)).unwrap(); s.capture(&capture("delete", 2)).unwrap();
            let deleted = s.list("delete", "all", 50, 0).unwrap()[0].id.clone();
            assert_eq!(s.clear_library().unwrap(), 2);
            assert_eq!(s.clear_library().unwrap(), 0);
            let backup = path.with_extension("backup.sqlite");
            s.backup_verified(&backup).unwrap();
            {
                let backed_up = Store::open(&backup).unwrap();
                assert_eq!(backed_up.undo_library_clear().unwrap(), 2);
            }
            std::fs::remove_file(&backup).unwrap();
            s.delete(&deleted).unwrap();
            s.capture(&capture("new", 3)).unwrap();
        }
        {
            let s = Store::open(&path).unwrap();
            assert_eq!(s.undo_library_clear().unwrap(), 1);
            assert_eq!(s.library_count().unwrap(), 2);
            assert_eq!(s.undo_library_clear().unwrap(), 0);
            assert_eq!(s.stats().unwrap().items, 2);
            assert_eq!(s.stats().unwrap().occurrences, 2);
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn clearing_preserves_archive_and_recapture_restores_membership() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut clip = Capture {
            kind: "text".into(),
            text: "orbital notes".into(),
            source: "test".into(),
            timestamp: 100,
            directory: "".into(),
            session: "".into(),
            sequence: None,
            representations: vec![],
        };
        s.capture(&clip).unwrap();
        let options = SearchOptions {
            library_only: true,
            ..Default::default()
        };
        let id = s
            .search_items("orbital", "all", 50, 0, "", &options)
            .unwrap()[0]
            .id
            .clone();
        assert_eq!(s.clear_library().unwrap(), 1);
        assert!(s
            .search_items("orbital", "all", 50, 0, "", &options)
            .unwrap()
            .is_empty());
        assert_eq!(s.list("orbital", "all", 50, 0).unwrap().len(), 1);
        assert_eq!(s.stats().unwrap().items, 1);
        let fuzzy = SearchOptions {
            library_only: true,
            fuzzy: true,
            ..Default::default()
        };
        assert!(s
            .search_items("orbitl", "all", 50, 0, "", &fuzzy)
            .unwrap()
            .is_empty());
        clip.timestamp = 101; // Even a repeated-copy burst makes an archived item visible again.
        s.capture(&clip).unwrap();
        assert_eq!(s.library_count().unwrap(), 1);
        s.clear_library().unwrap();
        s.restore_library_item(&id).unwrap();
        assert_eq!(s.library_count().unwrap(), 1);
        assert_eq!(
            s.search_items("orbitl", "all", 50, 0, "", &fuzzy)
                .unwrap()
                .len(),
            1
        );
        s.delete_with_recovery(&id, 110, 220).unwrap();
        assert_eq!(s.library_count().unwrap(), 0);
        s.undo_delete(&id, 111).unwrap();
        assert_eq!(s.library_count().unwrap(), 1);
        s.delete(&id).unwrap();
        assert_eq!(s.library_count().unwrap(), 0);
    }
    #[test]
    fn empty_library_survives_restart_and_command_retries_do_not_restore() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("target")
            .join(format!("library-test-{}.sqlite", uuid::Uuid::new_v4()));
        {
            let mut s = Store::open(&path).unwrap();
            let mut cmd = Capture {
                kind: "command".into(),
                text: "git status".into(),
                source: "PS".into(),
                timestamp: 1,
                directory: "/work".into(),
                session: "session".into(),
                sequence: Some(1),
                representations: vec![],
            };
            s.capture(&cmd).unwrap();
            s.clear_library().unwrap();
            assert!(!s.capture(&cmd).unwrap());
            assert_eq!(s.library_count().unwrap(), 0);
            cmd.sequence = Some(2);
            s.capture(&cmd).unwrap();
            assert_eq!(s.library_count().unwrap(), 1);
            s.clear_library().unwrap();
        }
        let s = Store::open(&path).unwrap();
        assert_eq!(s.library_count().unwrap(), 0);
        assert_eq!(s.stats().unwrap().occurrences, 2);
        drop(s);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn migration_populates_old_items_once_and_preserves_named_snippets() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        s.capture(&Capture {
            kind: "text".into(),
            text: "old notes".into(),
            source: "test".into(),
            timestamp: 1,
            directory: "".into(),
            session: "".into(),
            sequence: None,
            representations: vec![],
        })
        .unwrap();
        s.conn
            .execute_batch("DROP TABLE library; DROP TABLE library_state;")
            .unwrap();
        initialize(&s.conn).unwrap();
        assert_eq!(s.library_count().unwrap(), 1);
        s.clear_library().unwrap();
        initialize(&s.conn).unwrap();
        assert_eq!(s.library_count().unwrap(), 0);
        s.save_snippet(None, "Useful notes", "text", "named text", 2)
            .unwrap();
        assert_eq!(
            s.search_items(
                "named",
                "snippets",
                50,
                0,
                "",
                &SearchOptions {
                    library_only: true,
                    ..Default::default()
                }
            )
            .unwrap()
            .len(),
            1
        );
    }
}
