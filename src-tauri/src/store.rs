use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Representation {
    pub format: String,
    pub data: Vec<u8>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capture {
    pub kind: String,
    pub text: String,
    pub source: String,
    pub timestamp: i64,
    #[serde(default)]
    pub directory: String,
    #[serde(default)]
    pub session: String,
    #[serde(default)]
    pub sequence: Option<i64>,
    #[serde(default)]
    pub representations: Vec<Representation>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub source: String,
    pub timestamp: i64,
    pub first_seen: i64,
    pub occurrences: i64,
    pub pinned: bool,
    pub directory: String,
    pub formats: Vec<String>,
    pub collections: Vec<String>,
    pub bytes: i64,
    pub name: String,
    pub title: String,
    pub note: String,
    pub ocr_match: Option<crate::search::OcrMatch>,
    pub exit_code: Option<i64>,
    pub successful: Option<bool>,
    pub duration_ms: Option<i64>,
    pub failures: i64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub items: i64,
    pub occurrences: i64,
    pub bytes: i64,
    pub commands: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Occurrence {
    pub id: String,
    pub first_seen: i64,
    pub last_seen: i64,
    pub source: String,
    pub directory: String,
    pub session: String,
    pub repeats: i64,
    pub exit_code: Option<i64>,
    pub successful: Option<bool>,
    pub duration_ms: Option<i64>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub session: String,
    pub sequence: i64,
    pub exit_code: Option<i64>,
    pub successful: bool,
    pub duration_ms: i64,
}

pub struct Store {
    pub(crate) conn: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).map_err(err)?;
        conn.busy_timeout(std::time::Duration::from_secs(3))
            .map_err(err)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL, text TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, source TEXT NOT NULL,
                directory TEXT NOT NULL, session TEXT NOT NULL, sequence INTEGER, repeats INTEGER NOT NULL DEFAULT 1);
            CREATE UNIQUE INDEX IF NOT EXISTS command_delivery ON events(session, sequence) WHERE sequence IS NOT NULL;
            CREATE INDEX IF NOT EXISTS event_time ON events(last_seen DESC);
            CREATE INDEX IF NOT EXISTS event_item ON events(item_id, last_seen DESC);
            CREATE TABLE IF NOT EXISTS representations(item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                format TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(item_id, format));
            CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(item_id UNINDEXED, text, tokenize='trigram');
            CREATE TABLE IF NOT EXISTS thumbnails(item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE, preview TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS snippets(id TEXT PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS command_results(session TEXT NOT NULL,sequence INTEGER NOT NULL,exit_code INTEGER,successful INTEGER NOT NULL,duration_ms INTEGER NOT NULL,PRIMARY KEY(session,sequence));
            CREATE TABLE IF NOT EXISTS links(item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,domain TEXT NOT NULL,title TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS trash(id TEXT PRIMARY KEY,expires INTEGER NOT NULL,data TEXT NOT NULL);
            ").map_err(err)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(err)?;
        if version < 2 {
            let mut statement = conn
                .prepare(
                    "SELECT id,text FROM items WHERE text LIKE 'https://%' OR text LIKE 'http://%'",
                )
                .map_err(err)?;
            let rows = statement
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(err)?;
            for row in rows {
                let (id, text) = row.map_err(err)?;
                if let Ok(url) = url::Url::parse(text.trim()) {
                    if let Some(domain) = url.host_str() {
                        conn.execute(
                            "INSERT OR IGNORE INTO links(item_id,domain) VALUES(?,?)",
                            params![id, domain],
                        )
                        .map_err(err)?;
                    }
                }
            }
            conn.execute_batch("PRAGMA user_version=2").map_err(err)?;
        }
        let has_note: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('snippets') WHERE name='note')",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !has_note {
            conn.execute_batch("ALTER TABLE snippets ADD COLUMN note TEXT NOT NULL DEFAULT ''")
                .map_err(err)?;
        }
        let has_title: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('items') WHERE name='title')",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !has_title {
            conn.execute_batch("ALTER TABLE items ADD COLUMN title TEXT NOT NULL DEFAULT ''")
                .map_err(err)?;
        }
        crate::ocr::initialize(&conn)?;
        crate::notes::initialize(&conn)?;
        crate::library::initialize(&conn)?;
        crate::search::initialize(&conn)?;
        Ok(Self { conn })
    }
    pub fn capture(&mut self, capture: &Capture) -> Result<bool> {
        let tx = self.conn.transaction().map_err(err)?;
        let result = Self::capture_tx(&tx, capture)?;
        tx.commit().map_err(err)?;
        Ok(result)
    }
    /// Capture text typed or transformed in-app and return its item ID.
    /// `to_library` false leaves it permanent but out of the visible library.
    pub fn capture_text_item(&mut self, capture: &Capture, to_library: bool) -> Result<String> {
        self.capture(capture)?;
        let id: String = self
            .conn
            .query_row(
                "SELECT id FROM items WHERE fingerprint=?",
                [capture_fingerprint(capture)],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !to_library {
            self.conn
                .execute("DELETE FROM library WHERE item_id=?", [&id])
                .map_err(err)?;
        }
        Ok(id)
    }
    /// Replace a text clip's content in place (explicit user action). The previous text is kept in
    /// `item_revisions` so nothing is lost silently.
    pub fn replace_item_text(&mut self, id: &str, text: &str, now: i64) -> Result<()> {
        if text.is_empty() {
            return Err("A clip cannot be empty".into());
        }
        let tx = self.conn.transaction().map_err(err)?;
        let calculation: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM representations WHERE item_id=? AND format=?)", params![id, crate::calculator::FORMAT], |r| r.get(0)).map_err(err)?;
        if calculation {
            return Err("Saved calculations are immutable. Reuse the expression in Calculator, or save as a new text clip.".into());
        }
        let (kind, old): (String, String) = tx
            .query_row("SELECT kind,text FROM items WHERE id=?", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(err)?;
        if !["text", "rich", "command"].contains(&kind.as_str()) {
            return Err("Only text clips can be overwritten".into());
        }
        let fingerprint = capture_fingerprint(&Capture {
            kind: kind.clone(),
            text: text.to_string(),
            source: String::new(),
            timestamp: now,
            directory: String::new(),
            session: String::new(),
            sequence: None,
            representations: vec![],
        });
        let clash: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM items WHERE fingerprint=? AND id!=?)",
                params![fingerprint, id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if clash {
            return Err("An identical clip already exists; use Save as new clip".into());
        }
        tx.execute("CREATE TABLE IF NOT EXISTS item_revisions(item_id TEXT NOT NULL,text TEXT NOT NULL,replaced INTEGER NOT NULL)", []).map_err(err)?;
        tx.execute(
            "INSERT INTO item_revisions VALUES(?,?,?)",
            params![id, old, now],
        )
        .map_err(err)?;
        tx.execute(
            "UPDATE items SET text=?,fingerprint=? WHERE id=?",
            params![text, fingerprint, id],
        )
        .map_err(err)?;
        tx.execute("DELETE FROM representations WHERE item_id=?", [id])
            .map_err(err)?;
        tx.execute("DELETE FROM search WHERE item_id=?", [id])
            .map_err(err)?;
        tx.execute(
            "INSERT INTO search(item_id,text) VALUES(?,?)",
            params![id, text],
        )
        .map_err(err)?;
        let title: String = tx
            .query_row("SELECT title FROM items WHERE id=?", [id], |r| r.get(0))
            .map_err(err)?;
        crate::search::index(&tx, id, &format!("{title} {text}"))?;
        tx.execute("INSERT OR IGNORE INTO library VALUES(?)", [id])
            .map_err(err)?;
        tx.commit().map_err(err)
    }
    /// Persist a clipboard event and return only a newly unscanned image's ID.
    pub fn capture_clipboard(&mut self, capture: &Capture) -> Result<Option<String>> {
        self.capture(capture)?;
        if capture.kind != "image" {
            return Ok(None);
        }
        use rusqlite::OptionalExtension;
        self.conn.query_row(
            "SELECT id FROM items WHERE fingerprint=? AND NOT EXISTS(SELECT 1 FROM image_text WHERE item_id=items.id)",
            [capture_fingerprint(capture)], |r| r.get(0),
        ).optional().map_err(err)
    }
    pub fn capture_batch(&mut self, captures: &[Capture]) -> Result<usize> {
        let tx = self.conn.transaction().map_err(err)?;
        let mut count = 0;
        for capture in captures {
            count += usize::from(Self::capture_tx(&tx, capture)?);
        }
        tx.commit().map_err(err)?;
        Ok(count)
    }
    pub(crate) fn capture_tx(tx: &rusqlite::Transaction<'_>, capture: &Capture) -> Result<bool> {
        if !["text", "image", "files", "rich", "command"].contains(&capture.kind.as_str()) {
            return Err("Unsupported item kind".into());
        }
        if capture.kind == "command" && (capture.session.is_empty() || capture.sequence.is_none()) {
            return Err("Commands need a session and sequence".into());
        }
        let fingerprint = capture_fingerprint(capture);
        let representations = capture.representations.clone();
        if let Some(sequence) = capture.sequence {
            let delivered: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM events WHERE session=? AND sequence=?)",
                    params![capture.session, sequence],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if delivered {
                return Ok(false);
            }
        }
        let candidate = Uuid::new_v4().to_string();
        let inserted = tx
            .execute(
                "INSERT OR IGNORE INTO items(id,fingerprint,kind,text) VALUES(?,?,?,?)",
                params![candidate, fingerprint, capture.kind, capture.text],
            )
            .map_err(err)?;
        let id: String = tx
            .query_row(
                "SELECT id FROM items WHERE fingerprint=?",
                [&fingerprint],
                |r| r.get(0),
            )
            .map_err(err)?;
        if inserted != 0 {
            crate::search::index(tx, &id, &capture.text)?;
            if let Ok(url) = url::Url::parse(capture.text.trim()) {
                if ["http", "https"].contains(&url.scheme()) {
                    if let Some(domain) = url.host_str() {
                        tx.execute(
                            "INSERT OR IGNORE INTO links(item_id,domain) VALUES(?,?)",
                            params![id, domain],
                        )
                        .map_err(err)?;
                    }
                }
            }
            tx.execute(
                "INSERT INTO search(item_id,text) VALUES(?,?)",
                params![id, capture.text],
            )
            .map_err(err)?;
            for rep in representations {
                tx.execute(
                    "INSERT INTO representations VALUES(?,?,?)",
                    params![id, rep.format, rep.data],
                )
                .map_err(err)?;
            }
        }
        tx.execute("INSERT OR IGNORE INTO library VALUES(?)", [&id])
            .map_err(err)?;
        // Only the latest clipboard occurrence can be a repeat. Commands must not interrupt clipboard bursts.
        if capture.kind != "command" {
            let last = tx.query_row("SELECT e.id,e.item_id,e.source,e.last_seen FROM events e JOIN items i ON i.id=e.item_id WHERE i.kind!='command' ORDER BY e.rowid DESC LIMIT 1", [], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,i64>(3)?)));
            if let Ok((event_id, item_id, source, time)) = last {
                if item_id == id
                    && source == capture.source
                    && (0..=2000).contains(&(capture.timestamp - time))
                {
                    tx.execute(
                        "UPDATE events SET last_seen=?,repeats=repeats+1 WHERE id=?",
                        params![capture.timestamp, event_id],
                    )
                    .map_err(err)?;
                    return Ok(false);
                }
            }
        }
        tx.execute("INSERT INTO events(id,item_id,first_seen,last_seen,source,directory,session,sequence) VALUES(?,?,?,?,?,?,?,?)", params![Uuid::new_v4().to_string(),id,capture.timestamp,capture.timestamp,capture.source,capture.directory,capture.session,capture.sequence]).map_err(err)?;
        Ok(true)
    }
    pub fn list(&self, query: &str, filter: &str, limit: i64, offset: i64) -> Result<Vec<Item>> {
        self.list_in_directory(query, filter, limit, offset, "")
    }
    pub fn list_in_directory(
        &self,
        query: &str,
        filter: &str,
        limit: i64,
        offset: i64,
        directory: &str,
    ) -> Result<Vec<Item>> {
        self.search_items(
            query,
            filter,
            limit,
            offset,
            directory,
            &crate::search::SearchOptions::default(),
        )
    }
    pub fn search_items(
        &self,
        query: &str,
        filter: &str,
        limit: i64,
        offset: i64,
        directory: &str,
        options: &crate::search::SearchOptions,
    ) -> Result<Vec<Item>> {
        options.validate()?;
        let fuzzy = options.fuzzy && !query.trim().is_empty();
        let candidates = if fuzzy {
            serde_json::to_string(&self.fuzzy_ranked_scoped(query, options.library_only, filter)?)
                .map_err(err)?
        } else {
            String::new()
        };
        if filter == "snippets" {
            return self.snippets_search(query, limit, offset, options, &candidates);
        }
        // Literal substring semantics, including quotes, punctuation and 1–2 character queries.
        let escaped = query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let sql = "WITH fuzzy AS MATERIALIZED(SELECT json_extract(value,'$[0]') AS id,json_extract(value,'$[1]') AS rank FROM json_each(CASE WHEN :ids='' THEN '[]' ELSE :ids END))
            SELECT i.id,i.kind,i.text,i.pinned,e.source,e.last_seen,e.directory,
            (SELECT MIN(first_seen) FROM events WHERE item_id=i.id),
            (SELECT COUNT(*) FROM events WHERE item_id=i.id),
            COALESCE((SELECT SUM(length(data)) FROM representations WHERE item_id=i.id),0),
            result.exit_code,result.successful,result.duration_ms,
            (SELECT COUNT(*) FROM events failures JOIN command_results failed ON failed.session=failures.session AND failed.sequence=failures.sequence WHERE failures.item_id=i.id AND failed.successful=0), CASE WHEN :preview='' THEN '' ELSE COALESCE((SELECT text FROM image_text WHERE item_id=i.id),'') END,i.title,COALESCE((SELECT note FROM item_notes WHERE item_id=i.id),'')
            FROM items i JOIN events e ON e.rowid=(SELECT rowid FROM events WHERE item_id=i.id
              AND (:source='' OR source LIKE :source ESCAPE '\\') AND (:path='' OR directory LIKE :path ESCAPE '\\')
              AND (:from IS NULL OR last_seen>=:from) AND (:until IS NULL OR first_seen<:until) AND (:session='' OR session=:session)
              ORDER BY last_seen DESC,rowid DESC LIMIT 1)
            LEFT JOIN command_results result ON result.session=e.session AND result.sequence=e.sequence
            LEFT JOIN fuzzy ranked ON ranked.id=i.id
            WHERE (:query='' OR i.title LIKE :pattern ESCAPE '\\' OR EXISTS(SELECT 1 FROM item_notes WHERE item_id=i.id AND note LIKE :pattern ESCAPE '\\') OR i.text LIKE :pattern ESCAPE '\\' OR e.directory LIKE :pattern ESCAPE '\\' OR e.source LIKE :pattern ESCAPE '\\' OR EXISTS(SELECT 1 FROM links WHERE item_id=i.id AND title LIKE :pattern ESCAPE '\\') OR EXISTS(SELECT 1 FROM image_text WHERE item_id=i.id AND text LIKE :pattern ESCAPE '\\'))
            AND (:view='all' OR (:view='pinned' AND i.pinned=1) OR (:view='clips' AND i.kind!='command') OR (:view='clipboard_recent' AND i.kind!='command' AND NOT EXISTS(SELECT 1 FROM representations WHERE item_id=i.id AND format='application/vnd.archiver.calculation+json')) OR i.kind=:view OR (:view='links' AND EXISTS(SELECT 1 FROM links WHERE item_id=i.id)) OR (:view='failed' AND EXISTS(SELECT 1 FROM events failures JOIN command_results failed ON failed.session=failures.session AND failed.sequence=failures.sequence WHERE failures.item_id=i.id AND failed.successful=0)))
            AND (:kind='' OR i.kind=:kind) AND (:pinned IS NULL OR i.pinned=:pinned)
            AND (:library=0 OR EXISTS(SELECT 1 FROM library WHERE item_id=i.id))
            AND (:ids='' OR i.id IN(SELECT id FROM fuzzy))
            AND EXISTS(SELECT 1 FROM events scoped WHERE scoped.item_id=i.id
              AND (:source='' OR scoped.source LIKE :source ESCAPE '\\') AND (:path='' OR scoped.directory LIKE :path ESCAPE '\\')
              AND (:from IS NULL OR scoped.last_seen>=:from) AND (:until IS NULL OR scoped.first_seen<:until)
              AND (:session='' OR scoped.session=:session))
            AND (:tag='' OR EXISTS(SELECT 1 FROM labels WHERE item_id=i.id AND kind='tag' AND name=:tag COLLATE NOCASE))
            AND (:collection='' OR EXISTS(SELECT 1 FROM labels WHERE item_id=i.id AND kind='collection' AND name=:collection COLLATE NOCASE))
            ORDER BY CASE WHEN :preferred!='' AND i.kind='command' AND EXISTS(SELECT 1 FROM events context WHERE context.item_id=i.id AND context.directory=:preferred) THEN 0 ELSE 1 END,
              COALESCE(ranked.rank,0),e.last_seen DESC,e.rowid DESC LIMIT :limit OFFSET :offset";
        let sql = if fuzzy {
            sql.replace(
                "FROM items i JOIN events e",
                "FROM fuzzy ranked CROSS JOIN items i ON i.id=ranked.id JOIN events e",
            )
            .replace("LEFT JOIN fuzzy ranked ON ranked.id=i.id", "")
            .replace("(:ids='' OR i.id IN(SELECT id FROM fuzzy))", "1")
        } else {
            sql.to_owned()
        };
        let sql = if options.library_only && !fuzzy {
            sql.replace(
                "FROM items i JOIN events e",
                "FROM library visible CROSS JOIN items i ON i.id=visible.item_id JOIN events e",
            )
        } else {
            sql
        };
        let pattern = format!("%{escaped}%");
        let mut statement = self.conn.prepare(&sql).map_err(err)?;
        let rows = statement
            .query_map(
                rusqlite::named_params!{
                  ":query":if fuzzy {""}else{query},":pattern":pattern,":view":filter,":preferred":directory,
                  ":kind":options.kind,":pinned":options.pinned,":ids":candidates,":preview":query.trim(),
                  ":library":options.library_only,
                  ":source":crate::search::pattern(&options.source),":path":crate::search::pattern(&options.directory),
                  ":from":options.from,":until":options.until,":session":options.session,":tag":options.tag,":collection":options.collection,
                  ":limit":limit.clamp(1,100),":offset":offset.max(0)
                },
                |r| {
                    Ok(Item {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        text: r.get(2)?,
                        pinned: r.get(3)?,
                        source: r.get(4)?,
                        timestamp: r.get(5)?,
                        directory: r.get(6)?,
                        first_seen: r.get(7)?,
                        occurrences: r.get(8)?,
                        bytes: r.get(9)?,
                        name: String::new(),
                        title: r.get(15)?,
                        note: r.get(16)?,
                        ocr_match: crate::search::ocr_match(&r.get::<_,String>(14)?, query, fuzzy),
                        exit_code: r.get(10)?,
                        successful: r.get(11)?,
                        duration_ms: r.get(12)?,
                        failures: r.get(13)?,
                        formats: vec![],
                        collections: vec![],
                    })
                },
            )
            .map_err(err)?;
        let mut items = rows
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        for item in &mut items {
            item.collections = self.labels(&item.id)?.into_iter().filter(|(kind, _)| kind == "collection").map(|(_, name)| name).collect();
            let mut stmt = self
                .conn
                .prepare("SELECT format FROM representations WHERE item_id=? ORDER BY format")
                .map_err(err)?;
            item.formats = stmt
                .query_map([&item.id], |r| r.get(0))
                .map_err(err)?
                .collect::<std::result::Result<Vec<String>, _>>()
                .map_err(err)?;
        }
        Ok(items)
    }
    pub fn stats(&self) -> Result<Stats> {
        self.conn.query_row("SELECT (SELECT COUNT(*) FROM items),(SELECT COUNT(*) FROM events),(SELECT COALESCE(SUM(length(data)),0) FROM representations),(SELECT COUNT(*) FROM events e JOIN items i ON i.id=e.item_id WHERE i.kind='command')",[],|r| Ok(Stats { items:r.get(0)?,occurrences:r.get(1)?,bytes:r.get(2)?,commands:r.get(3)? })).map_err(err)
    }
    pub fn timeline(&self, id: &str, offset: i64) -> Result<Vec<Occurrence>> {
        let mut stmt=self.conn.prepare("SELECT e.id,e.first_seen,e.last_seen,e.source,e.directory,e.session,e.repeats,r.exit_code,r.successful,r.duration_ms FROM events e LEFT JOIN command_results r ON r.session=e.session AND r.sequence=e.sequence WHERE e.item_id=? ORDER BY e.last_seen DESC,e.rowid DESC LIMIT 50 OFFSET ?").map_err(err)?;
        let rows = stmt
            .query_map(params![id, offset.max(0)], |r| {
                Ok(Occurrence {
                    id: r.get(0)?,
                    first_seen: r.get(1)?,
                    last_seen: r.get(2)?,
                    source: r.get(3)?,
                    directory: r.get(4)?,
                    session: r.get(5)?,
                    repeats: r.get(6)?,
                    exit_code: r.get(7)?,
                    successful: r.get(8)?,
                    duration_ms: r.get(9)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(rows)
    }
    pub fn link_title(&self, id: &str) -> Result<String> {
        self.conn
            .query_row("SELECT title FROM links WHERE item_id=?", [id], |r| {
                r.get(0)
            })
            .map_err(err)
    }
    pub fn save_link_title(&self, id: &str, title: &str) -> Result<()> {
        self.conn
            .execute(
                "UPDATE links SET title=? WHERE item_id=?",
                params![title, id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn domains(&self) -> Result<Vec<(String, i64)>> {
        let mut statement=self.conn.prepare("SELECT domain,COUNT(*) FROM links GROUP BY domain ORDER BY COUNT(*) DESC,domain LIMIT 100").map_err(err)?;
        let result = statement
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(result)
    }
    pub fn pin(&self, id: &str, pinned: bool) -> Result<()> {
        if let Some(id) = id.strip_prefix("snippet:") {
            self.conn
                .execute(
                    "UPDATE snippets SET pinned=? WHERE id=?",
                    params![pinned, id],
                )
                .map_err(err)?;
            return Ok(());
        }
        self.conn
            .execute("UPDATE items SET pinned=? WHERE id=?", params![pinned, id])
            .map_err(err)?;
        Ok(())
    }
    /// Display metadata only: payload, capture identity and timestamps stay intact.
    pub fn rename_item(&self, id: &str, title: &str) -> Result<()> {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 200 || id.starts_with("snippet:") {
            return Err(
                "Use a pin name of 1–200 characters; edit snippets in the snippet editor".into(),
            );
        }
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        let text: String = tx
            .query_row("SELECT text FROM items WHERE id=?", [id], |r| r.get(0))
            .map_err(err)?;
        let ocr: String = tx
            .query_row(
                "SELECT COALESCE((SELECT text FROM image_text WHERE item_id=?),'')",
                [id],
                |r| r.get(0),
            )
            .map_err(err)?;
        tx.execute("UPDATE items SET title=? WHERE id=?", params![title, id])
            .map_err(err)?;
        crate::search::index(&tx, id, &format!("{title} {text} {ocr}"))?;
        tx.commit().map_err(err)
    }
    pub fn delete(&mut self, id: &str) -> Result<()> {
        self.delete_with_recovery(id, 0, 0)
    }
    pub fn delete_with_recovery(&mut self, id: &str, now: i64, window_ms: i64) -> Result<()> {
        let snapshot = if window_ms > 0 {
            Some(serde_json::to_string(&self.snapshot(Some(id))?).map_err(err)?)
        } else {
            None
        };
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute("DELETE FROM trash WHERE expires<=?", [now])
            .map_err(err)?;
        if let Some(data) = snapshot {
            tx.execute("INSERT INTO trash VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires,data=excluded.data",params![id,now+window_ms,data]).map_err(err)?;
        }
        if let Some(id) = id.strip_prefix("snippet:") {
            tx.execute("DELETE FROM snippets WHERE id=?", [id])
                .map_err(err)?;
            tx.commit().map_err(err)?;
            return Ok(());
        }
        tx.execute("DELETE FROM command_results WHERE EXISTS(SELECT 1 FROM events e WHERE e.item_id=? AND e.session=command_results.session AND e.sequence=command_results.sequence)",[id]).map_err(err)?;
        tx.execute("DELETE FROM search WHERE item_id=?", [id])
            .map_err(err)?;
        tx.execute("DELETE FROM items WHERE id=?", [id])
            .map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn payload(&self, id: &str) -> Result<Vec<Representation>> {
        if id.starts_with("snippet:") {
            return Ok(vec![]);
        }
        let mut stmt = self
            .conn
            .prepare("SELECT format,data FROM representations WHERE item_id=? AND format NOT IN ('application/vnd.archiver.calculation+json','application/vnd.archiver.calculation-submission') ORDER BY format")
            .map_err(err)?;
        let result = stmt
            .query_map([id], |r| {
                Ok(Representation {
                    format: r.get(0)?,
                    data: r.get(1)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(result)
    }
    pub fn content(&self, id: &str) -> Result<(String, String)> {
        if let Some(id) = id.strip_prefix("snippet:") {
            return self
                .conn
                .query_row("SELECT kind,text FROM snippets WHERE id=?", [id], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })
                .map_err(err);
        }
        self.conn
            .query_row("SELECT kind,text FROM items WHERE id=?", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(err)
    }
    pub fn command_result(&self, result: &CommandResult) -> Result<()> {
        if result.session.is_empty() || result.sequence < 1 || result.duration_ms < 0 {
            return Err("Invalid command completion metadata".into());
        }
        self.conn.execute("INSERT INTO command_results VALUES(?,?,?,?,?) ON CONFLICT(session,sequence) DO NOTHING",params![result.session,result.sequence,result.exit_code,result.successful,result.duration_ms]).map_err(err)?;
        Ok(())
    }
    pub fn thumbnail(&self, id: &str) -> Result<Option<crate::preview::Preview>> {
        use rusqlite::OptionalExtension;
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT preview FROM thumbnails WHERE item_id=?",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        json.map(|json| serde_json::from_str(&json).map_err(err))
            .transpose()
    }
    pub fn save_thumbnail(&self, id: &str, preview: &crate::preview::Preview) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO thumbnails VALUES(?,?)",
                params![id, serde_json::to_string(preview).map_err(err)?],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn save_snippet(
        &self,
        id: Option<&str>,
        name: &str,
        kind: &str,
        text: &str,
        now: i64,
    ) -> Result<String> {
        self.save_snippet_with_note(id, name, kind, text, None, now)
    }
    pub fn save_snippet_with_note(
        &self,
        id: Option<&str>,
        name: &str,
        kind: &str,
        text: &str,
        note: Option<&str>,
        now: i64,
    ) -> Result<String> {
        self.save_snippet_in_group(id, name, kind, text, note, None, now)
    }
    pub fn save_snippet_in_group(
        &self,
        id: Option<&str>,
        name: &str,
        kind: &str,
        text: &str,
        note: Option<&str>,
        collection: Option<&str>,
        now: i64,
    ) -> Result<String> {
        let collection = collection.filter(|g| !g.is_empty());
        if collection.is_some_and(|g| g.trim().is_empty() || g.len() > 100 || g.contains(',')) {
            return Err("Use a group name of 1–100 bytes without commas".into());
        }
        if note.is_some_and(|n| n.chars().count() > 10000) {
            return Err("Notes support up to 10,000 characters".into());
        }
        let name = name.trim();
        if name.is_empty()
            || name.len() > 200
            || text.is_empty()
            || text.len() > 1024 * 1024
            || !["text", "command"].contains(&kind)
        {
            return Err("Snippets need a name (up to 200 bytes), text (up to 1 MB), and text or command type".into());
        }
        let id = if let Some(id) = id {
            let id = id.strip_prefix("snippet:").ok_or("Invalid snippet ID")?;
            uuid::Uuid::parse_str(id).map_err(err)?;
            id.to_string()
        } else {
            Uuid::new_v4().to_string()
        };
        let template = regex::Regex::new(r"\{\{([A-Za-z_][A-Za-z0-9_-]*)(?::[^{}]*)?\}\}").unwrap();
        if template
            .captures_iter(text)
            .map(|c| c[1].to_string())
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            > 64
        {
            return Err("Templates support at most 64 distinct placeholders".into());
        }
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        let duplicate: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM snippets WHERE name=? COLLATE NOCASE AND id!=?)",
                params![name, id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if duplicate {
            return Err("A snippet already uses this name. Choose another name.".into());
        }
        tx.execute("INSERT INTO snippets(id,name,kind,text,created,updated,note) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,text=excluded.text,updated=excluded.updated,note=CASE WHEN ? THEN excluded.note ELSE snippets.note END",params![id,name,kind,text,now,now,note.unwrap_or(""),note.is_some()]).map_err(err)?;
        if let Some(group) = collection {
            tx.execute(
                "INSERT OR IGNORE INTO labels(item_id,kind,name) VALUES(?,'collection',?)",
                params![format!("snippet:{id}"), group.trim()],
            )
            .map_err(err)?;
        }
        crate::search::index(&tx, &format!("snippet:{id}"), &format!("{name} {text}"))?;
        tx.commit().map_err(err)?;
        Ok(format!("snippet:{id}"))
    }
    fn snippets_search(
        &self,
        query: &str,
        limit: i64,
        offset: i64,
        options: &crate::search::SearchOptions,
        candidates: &str,
    ) -> Result<Vec<Item>> {
        let pattern = format!(
            "%{}%",
            query
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        let mut stmt=self.conn.prepare("SELECT id,name,kind,text,created,updated,pinned,note FROM snippets WHERE
          (:ids='' AND (name LIKE :pattern ESCAPE '\\' OR text LIKE :pattern ESCAPE '\\') OR 'snippet:'||id IN(SELECT json_extract(value,'$[0]') FROM json_each(CASE WHEN :ids='' THEN '[]' ELSE :ids END)))
          AND (:kind='' OR kind=:kind) AND (:pinned IS NULL OR pinned=:pinned)
          AND (:source='' OR 'Named snippet' LIKE :source ESCAPE '\\') AND :path='' AND :session=''
          AND (:from IS NULL OR updated>=:from) AND (:until IS NULL OR updated<:until)
          AND (:tag='' OR EXISTS(SELECT 1 FROM labels WHERE item_id='snippet:'||snippets.id AND kind='tag' AND name=:tag COLLATE NOCASE))
          AND (:collection='' OR EXISTS(SELECT 1 FROM labels WHERE item_id='snippet:'||snippets.id AND kind='collection' AND name=:collection COLLATE NOCASE))
          ORDER BY pinned DESC,name COLLATE NOCASE LIMIT :limit OFFSET :offset").map_err(err)?;
        let mut result = stmt
            .query_map(
                rusqlite::named_params!{":pattern":pattern,":ids":candidates,":kind":options.kind,":pinned":options.pinned,
                  ":source":crate::search::pattern(&options.source),":path":options.directory,":session":options.session,
                  ":from":options.from,":until":options.until,":tag":options.tag,":collection":options.collection,":limit":limit.clamp(1,100),":offset":offset.max(0)},
                |r| {
                    let text: String = r.get(3)?;
                    Ok(Item {
                        id: format!("snippet:{}", r.get::<_, String>(0)?),
                        name: r.get(1)?,
                        title: String::new(),
                        note: r.get(7)?,
                        ocr_match: None,
                        kind: r.get(2)?,
                        bytes: text.len() as i64,
                        text,
                        first_seen: r.get(4)?,
                        timestamp: r.get(5)?,
                        pinned: r.get(6)?,
                        source: "Named snippet".into(),
                        directory: String::new(),
                        occurrences: 0,
                        exit_code: None,
                        successful: None,
                        duration_ms: None,
                        failures: 0,
                        formats: vec![],
                        collections: vec![],
                    })
                },
            )
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        for item in &mut result {
            item.collections = self.labels(&item.id)?.into_iter().filter(|(kind, _)| kind == "collection").map(|(_, name)| name).collect();
        }
        Ok(result)
    }
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Store {
        Store::open(Path::new(":memory:")).unwrap()
    }
    fn clip(text: &str, timestamp: i64) -> Capture {
        Capture {
            kind: "text".into(),
            text: text.into(),
            source: "editor".into(),
            timestamp,
            directory: String::new(),
            session: String::new(),
            sequence: None,
            representations: vec![],
        }
    }
    #[test]
    fn pin_names_survive_migration_recapture_restart_and_recovery() {
        let path = std::env::temp_dir().join(format!("archiver-pin-{}.sqlite", Uuid::new_v4()));
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("CREATE TABLE items(id TEXT PRIMARY KEY,fingerprint TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0)").unwrap();
        }
        let mut s = Store::open(&path).unwrap();
        s.capture(&clip("original payload", 100)).unwrap();
        let original = s.list("", "all", 50, 0).unwrap().remove(0);
        s.pin(&original.id, true).unwrap();
        assert!(s.rename_item(&original.id, "  ").is_err());
        s.rename_item(&original.id, "  Deployment checklist  ")
            .unwrap();
        let named = s.list("Deployment", "pinned", 50, 0).unwrap().remove(0);
        assert_eq!(named.title, "Deployment checklist");
        assert_eq!(named.text, original.text);
        assert_eq!(named.timestamp, original.timestamp);
        assert!(named.name.is_empty()); // Still a history item, never a snippet.
        let fuzzy = crate::search::SearchOptions {
            fuzzy: true,
            ..Default::default()
        };
        assert_eq!(
            s.search_items("Deploymnt", "pinned", 50, 0, "", &fuzzy)
                .unwrap()[0]
                .id,
            original.id
        );
        s.capture(&clip("original payload", 10000)).unwrap();
        assert_eq!(s.stats().unwrap().items, 1);
        drop(s);
        let mut s = Store::open(&path).unwrap();
        assert_eq!(
            s.list("Deployment", "pinned", 50, 0).unwrap()[0].title,
            named.title
        );
        s.replace_item_text(&original.id, "changed payload", 11000)
            .unwrap();
        assert_eq!(
            s.search_items("Deploymnt", "pinned", 50, 0, "", &fuzzy)
                .unwrap()[0]
                .title,
            named.title
        );
        s.delete_with_recovery(&original.id, 12000, 1000).unwrap();
        s.undo_delete(&original.id, 12001).unwrap();
        assert_eq!(
            s.search_items("Deploymnt", "pinned", 50, 0, "", &fuzzy)
                .unwrap()[0]
                .text,
            "changed payload"
        );
        drop(s);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn snippet_group_save_is_atomic_and_edits_keep_membership() {
        let s = store();
        let id = s
            .save_snippet_in_group(
                None,
                "Build",
                "command",
                "cargo build",
                Some("Notes"),
                Some("Work"),
                1,
            )
            .unwrap();
        let options = crate::search::SearchOptions {
            collection: "Work".into(),
            ..Default::default()
        };
        assert_eq!(
            s.search_items("", "snippets", 50, 0, "", &options).unwrap()[0].id,
            id
        );
        s.save_snippet_with_note(
            Some(&id),
            "Build release",
            "command",
            "cargo build --release",
            None,
            2,
        )
        .unwrap();
        let updated = s
            .search_items("", "snippets", 50, 0, "", &options)
            .unwrap()
            .remove(0);
        assert_eq!(updated.note, "Notes");
        assert_eq!(updated.name, "Build release");
        assert!(s
            .save_snippet_in_group(
                None,
                "Invalid",
                "text",
                "content",
                None,
                Some("bad,group"),
                3
            )
            .is_err());
        assert!(s
            .save_snippet_in_group(
                None,
                "Build release",
                "text",
                "content",
                None,
                Some("Other"),
                3
            )
            .is_err());
        assert_eq!(s.list("", "snippets", 50, 0).unwrap().len(), 1);
        assert_eq!(s.collection_groups().unwrap(), vec!["Work"]);
    }
    #[test]
    fn batch_import_is_atomic_and_repeat_safe() {
        let mut s = Store::open(Path::new(":memory:")).unwrap();
        let mut c = Capture {
            kind: "command".into(),
            text: "echo imported".into(),
            source: "import".into(),
            timestamp: 1,
            directory: String::new(),
            session: "import:test".into(),
            sequence: Some(1),
            representations: vec![],
        };
        assert_eq!(s.capture_batch(&[c.clone()]).unwrap(), 1);
        assert_eq!(s.capture_batch(&[c.clone()]).unwrap(), 0);
        c.sequence = Some(2);
        let mut bad = c.clone();
        bad.kind = "invalid".into();
        assert!(s.capture_batch(&[c.clone(), bad]).is_err());
        assert_eq!(s.stats().unwrap().occurrences, 1);
        assert_eq!(s.capture_batch(&[c]).unwrap(), 1);
    }
    #[test]
    fn repeat_burst_is_one_occurrence() {
        let mut s = store();
        for t in [1000, 1200, 1500, 2000, 2500] {
            s.capture(&clip("a", t)).unwrap();
        }
        assert_eq!(s.stats().unwrap().occurrences, 1);
        assert_eq!(s.list("", "all", 50, 0).unwrap()[0].first_seen, 1000);
    }
    #[test]
    fn intervening_clip_and_later_repeat_survive() {
        let mut s = store();
        for (v, t) in [("a", 1000), ("b", 1100), ("a", 1200), ("a", 10000)] {
            s.capture(&clip(v, t)).unwrap();
        }
        assert_eq!(s.stats().unwrap().items, 2);
        assert_eq!(s.stats().unwrap().occurrences, 4);
    }
    #[test]
    fn source_change_is_new_occurrence() {
        let mut s = store();
        s.capture(&clip("a", 1000)).unwrap();
        let mut c = clip("a", 1100);
        c.source = "browser".into();
        s.capture(&c).unwrap();
        assert_eq!(s.stats().unwrap().occurrences, 2);
    }
    #[test]
    fn commands_repeat_but_retries_do_not() {
        let mut s = store();
        let mut c = clip("git status", 1000);
        c.kind = "command".into();
        c.session = "test".into();
        for sequence in [1, 1, 2] {
            c.sequence = Some(sequence);
            s.capture(&c).unwrap();
        }
        assert_eq!(s.stats().unwrap().occurrences, 2);
    }
    #[test]
    fn completion_can_arrive_first_and_failed_search_includes_old_failures() {
        let mut s = store();
        s.command_result(&CommandResult {
            session: "test".into(),
            sequence: 1,
            exit_code: Some(7),
            successful: false,
            duration_ms: 120,
        })
        .unwrap();
        let mut c = clip("build", 1);
        c.kind = "command".into();
        c.session = "test".into();
        c.sequence = Some(1);
        s.capture(&c).unwrap();
        let row = s.list("", "failed", 50, 0).unwrap().remove(0);
        assert_eq!(row.exit_code, Some(7));
        assert_eq!(row.failures, 1);
        c.sequence = Some(2);
        c.timestamp = 2;
        s.capture(&c).unwrap();
        s.command_result(&CommandResult {
            session: "test".into(),
            sequence: 2,
            exit_code: Some(0),
            successful: true,
            duration_ms: 10,
        })
        .unwrap();
        let row = s.list("build", "failed", 50, 0).unwrap().remove(0);
        assert_eq!(row.successful, Some(true));
        assert_eq!(row.failures, 1);
        s.delete(&row.id).unwrap();
        assert!(s.list("", "failed", 50, 0).unwrap().is_empty());
        assert!(s
            .command_result(&CommandResult {
                session: "test".into(),
                sequence: 0,
                exit_code: None,
                successful: false,
                duration_ms: -1
            })
            .is_err());
    }
    #[test]
    fn formats_affect_identity_and_delete_cascades() {
        let mut s = store();
        let c = clip("a", 1000);
        s.capture(&c).unwrap();
        let mut rich = c.clone();
        rich.representations.push(Representation {
            format: "HTML Format".into(),
            data: vec![1, 2, 3],
        });
        s.capture(&rich).unwrap();
        assert_eq!(s.stats().unwrap().items, 2);
        for i in s.list("", "all", 50, 0).unwrap() {
            s.delete(&i.id).unwrap();
        }
        assert_eq!(s.stats().unwrap().occurrences, 0);
        assert_eq!(s.stats().unwrap().bytes, 0);
    }
    #[test]
    fn literal_search_handles_sql_and_wildcards() {
        let mut s = store();
        s.capture(&clip("echo 100%_done --force ' quote", 1000))
            .unwrap();
        for q in ["%_", "--force", "'"] {
            assert_eq!(s.list(q, "all", 50, 0).unwrap().len(), 1);
        }
        assert!(s.list("' OR 1=1", "all", 50, 0).unwrap().is_empty());
    }
    #[test]
    fn pinned_filter_and_pagination() {
        let mut s = store();
        for i in 0..3 {
            s.capture(&clip(&i.to_string(), i * 3000)).unwrap();
        }
        let list = s.list("", "all", 1, 0).unwrap();
        s.pin(&list[0].id, true).unwrap();
        assert_eq!(s.list("", "pinned", 50, 0).unwrap().len(), 1);
        assert_ne!(s.list("", "all", 1, 1).unwrap()[0].id, list[0].id);
    }
    #[test]
    fn archive_survives_reopen() {
        let path = std::env::temp_dir().join(format!("archiver-test-{}.sqlite3", Uuid::new_v4()));
        {
            let mut s = Store::open(&path).unwrap();
            s.capture(&clip("persistent", 1000)).unwrap();
            let id = s.list("", "all", 50, 0).unwrap()[0].id.clone();
            s.pin(&id, true).unwrap();
        }
        {
            let s = Store::open(&path).unwrap();
            assert_eq!(s.stats().unwrap().occurrences, 1);
            assert_eq!(s.list("persistent", "pinned", 50, 0).unwrap().len(), 1);
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn directory_suggestions_use_all_occurrences_and_keep_global_results() {
        let mut s = store();
        let mut c = clip("local build", 1);
        c.kind = "command".into();
        c.session = "one".into();
        c.sequence = Some(1);
        c.directory = "C:/project".into();
        s.capture(&c).unwrap();
        c.timestamp = 2;
        c.sequence = Some(2);
        c.directory = "C:/other".into();
        s.capture(&c).unwrap();
        c.text = "new global command".into();
        c.timestamp = 3;
        c.sequence = Some(3);
        s.capture(&c).unwrap();
        let local = s
            .list_in_directory("", "command", 50, 0, "C:/project")
            .unwrap();
        assert_eq!(local.len(), 2);
        assert_eq!(local[0].text, "local build");
        assert_eq!(
            s.list("", "command", 50, 0).unwrap()[0].text,
            "new global command"
        );
        assert_eq!(
            s.list_in_directory("new", "command", 50, 0, "C:/project")
                .unwrap()[0]
                .text,
            "new global command"
        );
        assert_eq!(
            s.list_in_directory("", "command", 1, 1, "C:/project")
                .unwrap()[0]
                .text,
            "new global command"
        );
    }
    #[test]
    fn multiline_unicode_and_invalid_command_events() {
        let mut s = store();
        let c = clip("日本語\nsecond line\n--flag", 1000);
        s.capture(&c).unwrap();
        assert_eq!(s.list("日本語", "all", 50, 0).unwrap()[0].text, c.text);
        let mut invalid = c;
        invalid.kind = "command".into();
        assert!(s.capture(&invalid).is_err());
        assert_eq!(s.stats().unwrap().occurrences, 1);
    }
    #[test]
    fn snippets_are_named_editable_and_separate_from_history() {
        let mut s = store();
        s.capture(&clip("original", 1)).unwrap();
        let id = s
            .save_snippet(None, "Build project", "command", "cargo build\n", 10)
            .unwrap();
        assert_eq!(
            s.list("", "snippets", 50, 0).unwrap()[0].name,
            "Build project"
        );
        assert_eq!(s.list("", "all", 50, 0).unwrap().len(), 1);
        assert_eq!(
            s.content(&id).unwrap(),
            ("command".into(), "cargo build\n".into())
        );
        assert!(s
            .save_snippet(None, "build PROJECT", "text", "duplicate", 11)
            .is_err());
        s.save_snippet(
            Some(&id),
            "Build project",
            "command",
            "cargo build --release",
            12,
        )
        .unwrap();
        s.pin(&id, true).unwrap();
        assert!(s.list("release", "snippets", 50, 0).unwrap()[0].pinned);
        assert!(s.payload(&id).unwrap().is_empty());
        s.delete(&id).unwrap();
        assert!(s.list("", "snippets", 50, 0).unwrap().is_empty());
        assert_eq!(s.stats().unwrap().items, 1);
    }
    #[test]
    fn overwrite_keeps_revision_and_rejects_duplicates() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mk = |t: &str| Capture {
            kind: "text".into(),
            text: t.into(),
            source: "test".into(),
            timestamp: 1,
            directory: "".into(),
            session: "".into(),
            sequence: None,
            representations: vec![],
        };
        let a = s.capture_text_item(&mk("alpha"), true).unwrap();
        let b = s.capture_text_item(&mk("beta"), true).unwrap();
        s.replace_item_text(&a, "gamma", 5).unwrap();
        assert!(s.replace_item_text(&a, "beta", 6).is_err());
        assert_eq!(s.content(&a).unwrap().1, "gamma");
        let kept: String = s
            .conn
            .query_row(
                "SELECT text FROM item_revisions WHERE item_id=?",
                [&a],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(kept, "alpha");
        assert_ne!(a, b);
    }
}

pub(crate) fn capture_fingerprint(capture: &Capture) -> String {
    let mut hash = Sha256::new();
    hash.update(capture.kind.as_bytes());
    hash.update([0]);
    hash.update(capture.text.as_bytes());
    let mut representations: Vec<_> = capture.representations.iter().collect();
    representations.sort_by(|a, b| a.format.cmp(&b.format));
    for rep in &representations {
        hash.update((rep.format.len() as u64).to_le_bytes());
        hash.update(rep.format.as_bytes());
        hash.update((rep.data.len() as u64).to_le_bytes());
        hash.update(&rep.data);
    }
    format!("{:x}", hash.finalize())
}
