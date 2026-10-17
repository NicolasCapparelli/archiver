//! Structured search and an indexed one-edit/adjacent-transposition vocabulary.
use crate::store::{Result, Store};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrMatch {
    pub excerpt: String,
    pub start: usize,
    pub end: usize,
    pub fuzzy: bool,
}
/// Character-safe excerpt; offsets use UTF-16 for JavaScript text slicing.
pub(crate) fn ocr_match(text: &str, query: &str, fuzzy: bool) -> Option<OcrMatch> {
    if text.is_empty() || query.trim().is_empty() {
        return None;
    }
    let chars: Vec<char> = text.chars().collect();
    let mut folded = String::new();
    let mut positions = Vec::new();
    for (index, c) in chars.iter().enumerate() {
        for lower in c.to_lowercase() {
            positions.push((folded.len(), index));
            folded.push(lower);
        }
    }
    let literal = query.to_lowercase();
    let found = folded
        .find(&literal)
        .map(|byte| {
            let start = positions.iter().rev().find(|(b, _)| *b <= byte).unwrap().1;
            let end = positions
                .iter()
                .rev()
                .find(|(b, _)| *b < byte + literal.len())
                .unwrap()
                .1
                + 1;
            (start, end, false)
        })
        .or_else(|| {
            if !fuzzy {
                return None;
            }
            let queries = words(query);
            let mut start = 0;
            while start < chars.len() {
                if !chars[start].is_alphanumeric() {
                    start += 1;
                    continue;
                }
                let mut end = start + 1;
                while end < chars.len() && chars[end].is_alphanumeric() {
                    end += 1;
                }
                let word = chars[start..end].iter().collect::<String>().to_lowercase();
                if word.chars().count() <= 48 && queries.iter().any(|q| score(q, &word).is_some()) {
                    return Some((start, end, true));
                }
                start = end;
            }
            None
        })?;
    let (start, end, approximate) = found;
    let left = start.saturating_sub(60);
    let right = (left + 240).min(chars.len());
    let prefix = if left > 0 { "…" } else { "" };
    let before: String = chars[left..start].iter().collect();
    let matched: String = chars[start..end.min(right)].iter().collect();
    let excerpt = format!(
        "{prefix}{}{}",
        chars[left..right].iter().collect::<String>(),
        if right < chars.len() { "…" } else { "" }
    );
    let start = prefix.encode_utf16().count() + before.encode_utf16().count();
    Some(OcrMatch {
        excerpt,
        start,
        end: start + matched.encode_utf16().count(),
        fuzzy: approximate,
    })
}

#[derive(Clone, Default, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchOptions {
    pub source: String,
    pub directory: String,
    pub kind: String,
    pub from: Option<i64>,
    pub until: Option<i64>,
    pub pinned: Option<bool>,
    pub session: String,
    pub tag: String,
    pub collection: String,
    pub fuzzy: bool,
    pub library_only: bool,
}
impl SearchOptions {
    pub fn validate(&self) -> Result<()> {
        if [
            self.source.len(),
            self.directory.len(),
            self.session.len(),
            self.tag.len(),
            self.collection.len(),
        ]
        .iter()
        .any(|n| *n > 2048)
        {
            return Err("Search filter is too long".into());
        }
        if !["", "text", "rich", "command", "image", "files"].contains(&self.kind.as_str()) {
            return Err("Unknown content type".into());
        }
        if self.from.zip(self.until).is_some_and(|(a, b)| a >= b) {
            return Err("The start date must precede the end date".into());
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
pub struct SavedSearch {
    pub name: String,
    pub query: String,
    pub filter: String,
    pub options: SearchOptions,
}

fn words(text: &str) -> BTreeSet<String> {
    text.chars()
        .take(32768)
        .collect::<String>()
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && w.chars().count() <= 48)
        .take(512)
        .map(str::to_owned)
        .collect()
}
pub(crate) fn pattern(text: &str) -> String {
    if text.is_empty() {
        String::new()
    } else {
        format!(
            "%{}%",
            text.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        )
    }
}
fn keys(word: &str) -> BTreeSet<String> {
    let chars: Vec<_> = word.chars().collect();
    let mut keys = BTreeSet::from([word.to_owned()]);
    for i in 0..chars.len() {
        keys.insert(
            chars
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, c)| *c)
                .collect(),
        );
    }
    keys
}
fn score(query: &str, word: &str) -> Option<usize> {
    if word.starts_with(query) {
        return Some(if word == query { 0 } else { 1 });
    }
    let a: Vec<_> = query.chars().collect();
    let b: Vec<_> = word.chars().collect();
    if a.len().abs_diff(b.len()) > 1 {
        return None;
    }
    if a.len() == b.len() {
        let different: Vec<_> = a
            .iter()
            .zip(&b)
            .enumerate()
            .filter(|(_, (a, b))| a != b)
            .map(|(i, _)| i)
            .collect();
        if different.len() == 1 {
            return Some(2);
        }
        if different.len() == 2
            && different[1] == different[0] + 1
            && a[different[0]] == b[different[1]]
            && a[different[1]] == b[different[0]]
        {
            return Some(2);
        }
        return None;
    }
    let (long, short) = if a.len() > b.len() {
        (&a, &b)
    } else {
        (&b, &a)
    };
    let mut i = 0;
    let mut j = 0;
    let mut skipped = false;
    while i < long.len() && j < short.len() {
        if long[i] == short[j] {
            i += 1;
            j += 1;
        } else if !skipped {
            skipped = true;
            i += 1;
        } else {
            return None;
        }
    }
    Some(2)
}
pub(crate) fn index(conn: &Connection, id: &str, text: &str) -> Result<()> {
    let note: String = conn.query_row("SELECT COALESCE((SELECT note FROM item_notes WHERE item_id=?),'')", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    let text = format!("{note} {text}");
    let old: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT term FROM item_terms WHERE item_id=?")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };
    conn.execute("DELETE FROM item_terms WHERE item_id=?", [id])
        .map_err(|e| e.to_string())?;
    for word in words(&text) {
        let added = conn
            .execute("INSERT OR IGNORE INTO terms VALUES(?)", [&word])
            .map_err(|e| e.to_string())?;
        if added > 0 {
            for key in keys(&word) {
                conn.execute(
                    "INSERT OR IGNORE INTO fuzzy_keys VALUES(?,?)",
                    params![key, word],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        conn.execute(
            "INSERT OR IGNORE INTO item_terms VALUES(?,?)",
            params![id, word],
        )
        .map_err(|e| e.to_string())?;
    }
    for term in old {
        conn.execute("DELETE FROM terms WHERE term=? AND NOT EXISTS(SELECT 1 FROM item_terms WHERE item_terms.term=terms.term)",[term]).map_err(|e|e.to_string())?;
    }
    Ok(())
}
pub(crate) fn initialize(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS terms(term TEXT PRIMARY KEY COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS item_terms(item_id TEXT NOT NULL,term TEXT NOT NULL REFERENCES terms(term) ON DELETE CASCADE,PRIMARY KEY(item_id,term));
      CREATE INDEX IF NOT EXISTS term_items ON item_terms(term,item_id);
      CREATE TABLE IF NOT EXISTS fuzzy_keys(key TEXT NOT NULL,term TEXT NOT NULL REFERENCES terms(term) ON DELETE CASCADE,PRIMARY KEY(key,term));
      CREATE TABLE IF NOT EXISTS search_meta(key TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS saved_searches(name TEXT PRIMARY KEY COLLATE NOCASE,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS labels(item_id TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL COLLATE NOCASE,PRIMARY KEY(item_id,kind,name));
      CREATE INDEX IF NOT EXISTS label_search ON labels(kind,name,item_id);
      CREATE TRIGGER IF NOT EXISTS search_delete AFTER DELETE ON items BEGIN
        DELETE FROM item_terms WHERE item_id=old.id; DELETE FROM labels WHERE item_id=old.id;
        DELETE FROM terms WHERE NOT EXISTS(SELECT 1 FROM item_terms WHERE item_terms.term=terms.term); END;
      CREATE TRIGGER IF NOT EXISTS snippet_search_delete AFTER DELETE ON snippets BEGIN
        DELETE FROM item_terms WHERE item_id='snippet:'||old.id; DELETE FROM labels WHERE item_id='snippet:'||old.id;
        DELETE FROM terms WHERE NOT EXISTS(SELECT 1 FROM item_terms WHERE item_terms.term=terms.term); END;").map_err(|e|e.to_string())?;
    let ready: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM search_meta WHERE key='words-v1')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !ready {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt=tx.prepare("SELECT i.id,i.title||' '||i.text||' '||COALESCE(o.text,'') FROM items i LEFT JOIN image_text o ON o.item_id=i.id UNION ALL SELECT 'snippet:'||id,name||' '||text FROM snippets").map_err(|e|e.to_string())?;
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                index(
                    &tx,
                    &row.get::<_, String>(0).map_err(|e| e.to_string())?,
                    &row.get::<_, String>(1).map_err(|e| e.to_string())?,
                )?;
            }
        }
        tx.execute("INSERT INTO search_meta VALUES('words-v1')", [])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}
impl Store {
    pub fn rename_collection(&mut self, old: &str, new: &str) -> Result<()> {
        let new = new.trim();
        if new.is_empty() || new.len() > 100 || new.contains(',') {
            return Err("Use a group name of 1–100 bytes without commas".into());
        }
        let groups = self.collection_groups()?;
        if !groups.iter().any(|name| name.eq_ignore_ascii_case(old)) { return Err("Group no longer exists".into()); }
        if groups.iter().any(|name| name.eq_ignore_ascii_case(new) && !name.eq_ignore_ascii_case(old)) { return Err("A group with that name already exists".into()); }
        let mut searches = self.saved_searches()?;
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE labels SET name=? WHERE kind='collection' AND name=? COLLATE NOCASE", params![new,old]).map_err(|e| e.to_string())?;
        for search in &mut searches {
            if search.options.collection.eq_ignore_ascii_case(old) {
                let previous = search.name.clone();
                search.options.collection = new.into();
                if previous.eq_ignore_ascii_case(&format!("Group: {old}")) { search.name = format!("Group: {new}"); }
                tx.execute("UPDATE saved_searches SET name=?,data=? WHERE name=?", params![search.name,serde_json::to_string(search).map_err(|e|e.to_string())?,previous]).map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn archive_statistics(&self) -> Result<serde_json::Value> {
        let counts = self.conn.query_row("SELECT (SELECT COUNT(*) FROM snippets),(SELECT COUNT(*) FROM items WHERE pinned=1)+(SELECT COUNT(*) FROM snippets WHERE pinned=1),(SELECT COUNT(*) FROM library),(SELECT COUNT(DISTINCT source) FROM events WHERE source!=''),(SELECT MIN(first_seen) FROM events),(SELECT MAX(last_seen) FROM events),(SELECT COALESCE(SUM(repeats),0) FROM events)", [], |r| Ok(serde_json::json!({"snippets":r.get::<_,i64>(0)?,"pins":r.get::<_,i64>(1)?,"library":r.get::<_,i64>(2)?,"sources":r.get::<_,i64>(3)?,"firstCapture":r.get::<_,Option<i64>>(4)?,"lastCapture":r.get::<_,Option<i64>>(5)?,"copies":r.get::<_,i64>(6)?}))).map_err(|e|e.to_string())?;
        let mut statement = self.conn.prepare("SELECT kind,COUNT(*) FROM items GROUP BY kind ORDER BY COUNT(*) DESC,kind").map_err(|e|e.to_string())?;
        let kinds = statement.query_map([], |r| Ok(serde_json::json!({"name":r.get::<_,String>(0)?,"count":r.get::<_,i64>(1)?}))).map_err(|e|e.to_string())?.collect::<std::result::Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        let mut statement = self.conn.prepare("SELECT source,COUNT(*) FROM events GROUP BY source ORDER BY COUNT(*) DESC,source LIMIT 8").map_err(|e|e.to_string())?;
        let sources = statement.query_map([], |r| Ok(serde_json::json!({"name":r.get::<_,String>(0)?,"count":r.get::<_,i64>(1)?}))).map_err(|e|e.to_string())?.collect::<std::result::Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(serde_json::json!({"counts":counts,"groups":self.collection_groups()?.len(),"kinds":kinds,"sources":sources}))
    }

    pub fn collection_groups(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT name FROM (SELECT name FROM labels WHERE kind='collection' UNION SELECT json_extract(data,'$.options.collection') FROM saved_searches WHERE name LIKE 'Group: %' AND COALESCE(json_extract(data,'$.options.collection'),'')!='') GROUP BY name COLLATE NOCASE ORDER BY name COLLATE NOCASE").map_err(|e| e.to_string())?;
        let groups = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<String>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(groups)
    }

    pub fn command_sessions(&self) -> Result<Vec<serde_json::Value>> {
        let mut stmt=self.conn.prepare("SELECT e.session,MIN(e.first_seen),MAX(e.last_seen),COUNT(*),COUNT(DISTINCT e.directory),MAX(e.source),SUM(CASE WHEN r.successful=0 THEN 1 ELSE 0 END) FROM events e JOIN items i ON i.id=e.item_id LEFT JOIN command_results r ON r.session=e.session AND r.sequence=e.sequence WHERE i.kind='command' AND e.session!='' AND e.session NOT LIKE 'import:%' GROUP BY e.session ORDER BY MAX(e.last_seen) DESC LIMIT 100").map_err(|e|e.to_string())?;
        let result=stmt.query_map([],|r|Ok(serde_json::json!({"session":r.get::<_,String>(0)?,"firstSeen":r.get::<_,i64>(1)?,"lastSeen":r.get::<_,i64>(2)?,"commands":r.get::<_,i64>(3)?,"directories":r.get::<_,i64>(4)?,"source":r.get::<_,String>(5)?,"failures":r.get::<_,i64>(6)?}))).map_err(|e|e.to_string())?.collect::<std::result::Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(result)
    }
    pub fn session_timeline(&self, session: &str, offset: i64) -> Result<Vec<serde_json::Value>> {
        if session.is_empty() || session.len() > 2048 {
            return Err("Choose a valid recorded session".into());
        }
        let mut stmt = self.conn.prepare("SELECT e.id,e.item_id,i.text,e.first_seen,e.directory,e.source,e.sequence,r.successful,r.exit_code,r.duration_ms FROM events e JOIN items i ON i.id=e.item_id LEFT JOIN command_results r ON r.session=e.session AND r.sequence=e.sequence WHERE e.session=? AND i.kind='command' AND e.sequence IS NOT NULL ORDER BY e.sequence,e.first_seen,e.rowid LIMIT 50 OFFSET ?").map_err(|e|e.to_string())?;
        let rows = stmt.query_map(params![session,offset.max(0)], |r| Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"itemId":r.get::<_,String>(1)?,"text":r.get::<_,String>(2)?,"timestamp":r.get::<_,i64>(3)?,"directory":r.get::<_,String>(4)?,"source":r.get::<_,String>(5)?,"sequence":r.get::<_,i64>(6)?,"successful":r.get::<_,Option<bool>>(7)?,"exitCode":r.get::<_,Option<i64>>(8)?,"durationMs":r.get::<_,Option<i64>>(9)?}))).map_err(|e|e.to_string())?.collect::<std::result::Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(rows)
    }
    pub fn fuzzy_ids(&self, query: &str) -> Result<Vec<String>> {
        Ok(self
            .fuzzy_ranked(query)?
            .into_iter()
            .map(|(id, _)| id)
            .collect())
    }
    pub fn fuzzy_ranked(&self, query: &str) -> Result<Vec<(String, usize)>> {
        self.fuzzy_ranked_scoped(query, false, "any")
    }
    pub fn fuzzy_ranked_scoped(
        &self,
        query: &str,
        library_only: bool,
        filter: &str,
    ) -> Result<Vec<(String, usize)>> {
        // Scope vocabulary AND postings before either bounded candidate budget is spent.
        let scope = if filter == "any" {
            "1"
        } else if filter == "snippets" {
            "item_id LIKE 'snippet:%'"
        } else if library_only {
            "EXISTS(SELECT 1 FROM library WHERE library.item_id=item_terms.item_id)"
        } else {
            "item_id NOT LIKE 'snippet:%'"
        };
        if query.len() > 512 {
            return Err("Fuzzy queries are limited to 512 bytes".into());
        }
        let query_words = words(query);
        if query_words.is_empty() {
            return Ok(vec![]);
        }
        if query_words.len() > 8 {
            return Err("Fuzzy search supports up to eight words".into());
        }
        let mut combined: Option<HashMap<String, usize>> = None;
        for word in query_words {
            let mut vocabulary = BTreeSet::new();
            let mut stmt = self
                .conn
                .prepare(&format!("SELECT term FROM terms WHERE term LIKE ? AND EXISTS(SELECT 1 FROM item_terms WHERE item_terms.term=terms.term AND {scope}) ORDER BY term LIMIT 1000"))
                .map_err(|e| e.to_string())?;
            for row in stmt
                .query_map([format!("{word}%")], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?
            {
                vocabulary.insert(row.map_err(|e| e.to_string())?);
            }
            if word.chars().count() >= 3 {
                let json = serde_json::to_string(&keys(&word)).map_err(|e| e.to_string())?;
                let mut stmt=self.conn.prepare(&format!("SELECT DISTINCT term FROM fuzzy_keys WHERE key IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM item_terms WHERE item_terms.term=fuzzy_keys.term AND {scope}) ORDER BY term LIMIT 1000")).map_err(|e|e.to_string())?;
                for row in stmt
                    .query_map([json], |r| r.get::<_, String>(0))
                    .map_err(|e| e.to_string())?
                {
                    vocabulary.insert(row.map_err(|e| e.to_string())?);
                }
            }
            let ranked: HashMap<String, usize> = vocabulary
                .into_iter()
                .filter_map(|term| score(&word, &term).map(|s| (term, s)))
                .collect();
            let json = serde_json::to_string(&ranked.keys().collect::<Vec<_>>())
                .map_err(|e| e.to_string())?;
            let mut stmt=self.conn.prepare(&format!("SELECT item_id,term FROM item_terms WHERE term IN(SELECT value FROM json_each(?)) AND {scope} ORDER BY item_id,term LIMIT 20000")).map_err(|e|e.to_string())?;
            let mut matched = HashMap::new();
            for row in stmt
                .query_map([json], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?
            {
                let (id, term) = row.map_err(|e| e.to_string())?;
                let s = ranked[&term];
                matched
                    .entry(id)
                    .and_modify(|current: &mut usize| *current = (*current).min(s))
                    .or_insert(s);
            }
            combined = Some(match combined {
                None => matched,
                Some(old) => old
                    .into_iter()
                    .filter_map(|(id, s)| matched.get(&id).map(|score| (id, s + score)))
                    .collect(),
            });
        }
        let mut ranked: Vec<_> = combined.unwrap_or_default().into_iter().collect();
        ranked.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
        Ok(ranked)
    }
    pub fn saved_searches(&self) -> Result<Vec<SavedSearch>> {
        let mut stmt = self
            .conn
            .prepare("SELECT data FROM saved_searches ORDER BY name COLLATE NOCASE")
            .map_err(|e| e.to_string())?;
        let values = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        values
            .iter()
            .map(|s| serde_json::from_str(s).map_err(|e| e.to_string()))
            .collect()
    }
    pub fn save_search(&self, search: &SavedSearch) -> Result<()> {
        search.options.validate()?;
        if search.name.trim().is_empty()
            || search.name.len() > 200
            || search.query.len() > 4096
            || ![
                "all", "clips", "text", "rich", "command", "image", "files", "failed", "pinned",
                "snippets", "links",
            ]
            .contains(&search.filter.as_str())
        {
            return Err("Invalid saved search name, query, or view".into());
        }
        self.conn.execute("INSERT INTO saved_searches VALUES(?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data",params![search.name.trim(),serde_json::to_string(search).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn delete_search(&self, name: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM saved_searches WHERE name=?", [name])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn labels(&self, id: &str) -> Result<Vec<(String, String)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT kind,name FROM labels WHERE item_id=? ORDER BY kind,name")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(result)
    }
    pub fn set_labels(&self, id: &str, kind: &str, names: &[String]) -> Result<()> {
        self.content(id)?;
        if !["tag", "collection"].contains(&kind)
            || names.len() > 32
            || names
                .iter()
                .any(|n| n.trim().is_empty() || n.len() > 100 || n.contains(','))
        {
            return Err("Use up to 32 names, each 1–100 bytes without commas".into());
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM labels WHERE item_id=? AND kind=?",
            params![id, kind],
        )
        .map_err(|e| e.to_string())?;
        for name in names {
            tx.execute(
                "INSERT OR IGNORE INTO labels VALUES(?,?,?)",
                params![id, kind, name.trim()],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn set_organization(
        &self,
        id: &str,
        tags: &[String],
        collections: &[String],
    ) -> Result<()> {
        self.content(id)?;
        for names in [tags, collections] {
            if names.len() > 32
                || names
                    .iter()
                    .any(|n| n.trim().is_empty() || n.len() > 100 || n.contains(','))
            {
                return Err("Use up to 32 names, each 1–100 bytes without commas".into());
            }
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM labels WHERE item_id=?", [id])
            .map_err(|e| e.to_string())?;
        for (kind, names) in [("tag", tags), ("collection", collections)] {
            for name in names {
                tx.execute(
                    "INSERT OR IGNORE INTO labels VALUES(?,?,?)",
                    params![id, kind, name.trim()],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn bulk_organization(
        &self,
        ids: &[String],
        tags: &[String],
        collections: &[String],
        remove: bool,
    ) -> Result<()> {
        if ids.is_empty() || ids.len() > 500 {
            return Err("Choose 1–500 items".into());
        }
        for names in [tags, collections] {
            if names.len() > 32
                || names
                    .iter()
                    .any(|n| n.trim().is_empty() || n.len() > 100 || n.contains(','))
            {
                return Err("Use up to 32 names, each 1–100 bytes without commas".into());
            }
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        for id in ids {
            self.content(id)?;
            for (kind, names) in [("tag", tags), ("collection", collections)] {
                for name in names {
                    if remove {
                        tx.execute("DELETE FROM labels WHERE item_id=? AND kind=? AND name=? COLLATE NOCASE", params![id, kind, name.trim()]).map_err(|e| e.to_string())?;
                    } else {
                        tx.execute(
                            "INSERT OR IGNORE INTO labels VALUES(?,?,?)",
                            params![id, kind, name.trim()],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
                let count: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM labels WHERE item_id=? AND kind=?",
                        params![id, kind],
                        |r| r.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if count > 32 {
                    return Err("An item may have at most 32 labels of each kind".into());
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn collection_rename_preserves_memberships_payloads_and_saved_filters() {
        let root = std::env::temp_dir().join(format!("archiver-rename-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("archive.sqlite");
        let mut s = Store::open(&path).unwrap();
        let id = s.save_snippet(None, "Example", "command", "git status", 1).unwrap();
        s.set_organization(&id, &["Keep".into()], &["Work".into(), "Other".into()]).unwrap();
        for name in ["Group: Work", "My saved filter"] {
            s.save_search(&SavedSearch { name: name.into(), query: "git".into(), filter: "snippets".into(), options: SearchOptions { collection: "Work".into(), ..Default::default() } }).unwrap();
        }
        s.rename_collection("work", "Projects").unwrap();
        assert_eq!(s.content(&id).unwrap().1, "git status");
        assert!(s.labels(&id).unwrap().contains(&("tag".into(), "Keep".into())));
        assert_eq!(s.list("", "snippets", 50, 0).unwrap()[0].collections, vec!["Other", "Projects"]);
        assert!(s.saved_searches().unwrap().iter().all(|search| search.options.collection == "Projects"));
        assert!(s.saved_searches().unwrap().iter().any(|search| search.name == "Group: Projects"));
        for name in ["Other", "", "bad,name"] { assert!(s.rename_collection("Projects", name).is_err()); }
        s.rename_collection("Projects", "PROJECTS").unwrap();
        let other = s.save_snippet(None, "Another", "text", "Other content", 2).unwrap();
        s.set_labels(&other, "collection", &["projects".into()]).unwrap();
        assert_eq!(s.collection_groups().unwrap().len(), 2);
        s.save_search(&SavedSearch { name: "Group: Empty".into(), query: String::new(), filter: "snippets".into(), options: SearchOptions { collection: "Empty".into(), ..Default::default() } }).unwrap();
        s.rename_collection("Empty", "Later").unwrap();
        s.save_search(&SavedSearch { name: "Group: Conflict".into(), query: String::new(), filter: "all".into(), options: SearchOptions::default() }).unwrap();
        assert!(s.rename_collection("PROJECTS", "Conflict").is_err());
        assert!(s.labels(&id).unwrap().contains(&("collection".into(), "PROJECTS".into())));
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(s.collection_groups().unwrap(), vec!["Later", "Other", "PROJECTS"]);
        assert_eq!(s.list("", "snippets", 50, 0).unwrap().iter().find(|item| item.id == id).unwrap().collections, vec!["Other", "PROJECTS"]);
        drop(s);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn archive_statistics_include_repeats_and_survive_library_clear() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        assert!(s.archive_statistics().unwrap()["counts"]["firstCapture"].is_null());
        for timestamp in [10, 20] {
            s.capture(&Capture { kind: "text".into(), text: "Preserved".into(), source: "Editor".into(), timestamp, directory: String::new(), session: String::new(), sequence: None, representations: vec![] }).unwrap();
        }
        let clip = s.list("", "all", 50, 0).unwrap()[0].id.clone();
        s.set_labels(&clip, "collection", &["Clips".into()]).unwrap();
        assert_eq!(s.list("", "all", 50, 0).unwrap()[0].collections, vec!["Clips"]);
        let snippet = s.save_snippet(None, "Reusable", "text", "Snippet", 30).unwrap();
        s.pin(&snippet, true).unwrap();
        s.set_labels(&snippet, "collection", &["Vault".into()]).unwrap();
        s.clear_library().unwrap();
        let value = s.archive_statistics().unwrap();
        assert_eq!(value["counts"]["copies"], 2);
        assert_eq!(value["counts"]["library"], 0);
        assert_eq!(value["counts"]["snippets"], 1);
        assert_eq!(value["counts"]["pins"], 1);
        assert_eq!(value["counts"]["sources"], 1);
        assert_eq!(value["counts"]["firstCapture"], 10);
        assert_eq!(value["counts"]["lastCapture"], 20);
        assert_eq!(value["groups"], 2);
        assert_eq!(value["kinds"][0]["count"], 1);
        assert_eq!(s.stats().unwrap().items, 1);
        assert_eq!(s.content(&clip).unwrap().1, "Preserved");
    }

    #[test]
    fn groups_survive_restart_and_moves_preserve_tags_and_archive() {
        let root = std::env::temp_dir().join(format!("archiver-groups-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("archive.sqlite");
        let s = Store::open(&path).unwrap();
        let id = s
            .save_snippet(None, "Grouped snippet", "text", "Content", 1)
            .unwrap();
        s.save_search(&SavedSearch {
            name: "Group: Empty".into(),
            query: String::new(),
            filter: "all".into(),
            options: SearchOptions {
                collection: "Empty".into(),
                ..Default::default()
            },
        })
        .unwrap();
        s.set_organization(&id, &["Keep".into()], &["From".into()])
            .unwrap();
        assert_eq!(s.collection_groups().unwrap(), vec!["Empty", "From"]);
        s.set_labels(&id, "collection", &["To".into()]).unwrap();
        assert!(s
            .labels(&id)
            .unwrap()
            .contains(&("tag".into(), "Keep".into())));
        assert!(!s
            .labels(&id)
            .unwrap()
            .contains(&("collection".into(), "From".into())));
        assert_eq!(s.content(&id).unwrap().1, "Content");
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(s.collection_groups().unwrap(), vec!["Empty", "To"]);
        s.set_labels(&id, "collection", &[]).unwrap();
        assert_eq!(s.collection_groups().unwrap(), vec!["Empty"]);
        drop(s);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn ocr_excerpts_are_unicode_safe_bounded_and_do_not_rescan() {
        use crate::ocr::OcrRecord;
        use crate::store::Capture;
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        s.capture(&Capture {
            kind: "image".into(),
            text: "Screenshot".into(),
            source: "Editor".into(),
            timestamp: 1,
            directory: String::new(),
            session: String::new(),
            sequence: None,
            representations: vec![],
        })
        .unwrap();
        let id = s.list("", "image", 50, 0).unwrap()[0].id.clone();
        let text = format!(
            "{}😀 Café <script> needleword {}",
            "context ".repeat(300),
            "tail ".repeat(300)
        );
        s.save_ocr(
            &id,
            &OcrRecord {
                text,
                language: "en".into(),
                error: String::new(),
            },
            777,
        )
        .unwrap();
        let rows = s.list("Café", "image", 50, 0).unwrap();
        let m = rows[0].ocr_match.as_ref().unwrap();
        let utf16: Vec<_> = m.excerpt.encode_utf16().collect();
        assert_eq!(String::from_utf16(&utf16[m.start..m.end]).unwrap(), "Café");
        assert!(m.excerpt.chars().count() <= 242);
        assert!(!m.fuzzy);
        assert!(s.list("<script>", "image", 50, 0).unwrap()[0]
            .ocr_match
            .as_ref()
            .unwrap()
            .excerpt
            .contains("<script>"));
        let options = SearchOptions {
            fuzzy: true,
            library_only: true,
            ..Default::default()
        };
        let rows = s
            .search_items("nedleword", "image", 50, 0, "", &options)
            .unwrap();
        assert!(rows[0].ocr_match.as_ref().unwrap().fuzzy);
        assert!(s
            .search_items("nedleword", "image", 50, 1, "", &options)
            .unwrap()
            .is_empty());
        assert!(s.list("", "image", 50, 0).unwrap()[0].ocr_match.is_none());
        let updated: i64 = s
            .conn
            .query_row(
                "SELECT updated FROM image_text WHERE item_id=?",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(updated, 777);
        s.clear_library().unwrap();
        assert!(s
            .search_items("nedleword", "image", 50, 0, "", &options)
            .unwrap()
            .is_empty());
        assert_eq!(s.list("Café", "image", 50, 0).unwrap().len(), 1);
    }

    #[test]
    fn archived_vocabulary_and_postings_cannot_exhaust_library_fuzzy_budget() {
        let s = Store::open(std::path::Path::new(":memory:")).unwrap();
        let tx = s.conn.unchecked_transaction().unwrap();
        tx.execute_batch("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<21000) INSERT INTO items(id,fingerprint,kind,text) SELECT printf('a%05d',x),printf('fp%05d',x),'text','needlezz' FROM n;
            INSERT INTO events(id,item_id,first_seen,last_seen,source,directory,session) SELECT id,id,1,1,'Synthetic','','' FROM items;
            INSERT INTO items(id,fingerprint,kind,text,pinned) VALUES('zz-visible','visible','text','needlezz',0);
            INSERT INTO events(id,item_id,first_seen,last_seen,source,directory,session) VALUES('visible-event','zz-visible',2,2,'Synthetic','','');
            INSERT INTO library VALUES('zz-visible');").unwrap();
        index(&tx, "zz-visible", "needlezz").unwrap();
        tx.execute(
            "INSERT INTO item_terms SELECT id,'needlezz' FROM items WHERE id!='zz-visible'",
            [],
        )
        .unwrap();
        for n in 0..1100 {
            index(
                &tx,
                &format!("a{:05}", n + 1),
                &format!("needle{n:04} needlezz"),
            )
            .unwrap();
        }
        tx.commit().unwrap();
        let options = SearchOptions {
            fuzzy: true,
            library_only: true,
            ..Default::default()
        };
        let start = std::time::Instant::now();
        assert_eq!(
            s.search_items("needle", "all", 50, 0, "", &options)
                .unwrap()[0]
                .id,
            "zz-visible"
        );
        assert!(s
            .search_items("needle", "all", 50, 1, "", &options)
            .unwrap()
            .is_empty());
        eprintln!("Scoped fuzzy synthetic benchmark: 21,001 items, 1 library item, 1,101 terms, debug/in-memory: {:?}", start.elapsed());
        let snippet = s
            .save_snippet(None, "Needle snippet", "text", "needlezz", 3)
            .unwrap();
        assert_eq!(
            s.search_items("needle", "snippets", 50, 0, "", &options)
                .unwrap()[0]
                .id,
            snippet
        );
    }
    use super::*;
    use crate::store::Capture;
    #[test]
    fn bulk_labels_are_atomic_deduplicated_and_preserve_unrelated_labels() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        for (text, kind) in [("notes", "text"), ("git status", "command")] {
            s.capture(&Capture {
                kind: kind.into(),
                text: text.into(),
                source: "test".into(),
                timestamp: 1,
                directory: "".into(),
                session: "bulk-test".into(),
                sequence: if kind == "command" { Some(1) } else { None },
                representations: vec![],
            })
            .unwrap();
        }
        let snippet = s
            .save_snippet(None, "Template", "text", "hello", 2)
            .unwrap();
        let mut ids: Vec<String> = s
            .list("", "all", 50, 0)
            .unwrap()
            .iter()
            .map(|i| i.id.clone())
            .collect();
        if !ids.contains(&snippet) {
            ids.push(snippet);
        }
        s.bulk_organization(&ids, &["Keep".into()], &[], false)
            .unwrap();
        s.bulk_organization(
            &ids,
            &["Work".into(), "work".into()],
            &["Project".into()],
            false,
        )
        .unwrap();
        for id in &ids {
            assert_eq!(s.labels(id).unwrap().len(), 3);
        }
        let invalid = vec![ids[0].clone(), "missing".into()];
        assert!(s
            .bulk_organization(&invalid, &["rollback".into()], &[], false)
            .is_err());
        assert!(!s
            .labels(&ids[0])
            .unwrap()
            .iter()
            .any(|(_, n)| n == "rollback"));
        s.bulk_organization(&ids, &["WORK".into()], &[], true)
            .unwrap();
        for id in &ids {
            assert_eq!(s.labels(id).unwrap().len(), 2);
        }
        s.clear_library().unwrap();
        s.undo_library_clear().unwrap();
        for id in &ids {
            assert_eq!(s.labels(id).unwrap().len(), 2);
        }
    }
    #[test]
    fn session_timeline_retains_repeats_sequence_results_and_pagination() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        for sequence in (1..=52).rev() {
            s.capture(&Capture {
                kind: "command".into(),
                text: "git status\n# 🛰".into(),
                source: "PS".into(),
                timestamp: 100 - sequence,
                directory: format!("/work/{sequence}"),
                session: "chronology".into(),
                sequence: Some(sequence),
                representations: vec![],
            })
            .unwrap();
        }
        s.command_result(&crate::store::CommandResult {
            session: "chronology".into(),
            sequence: 2,
            exit_code: Some(7),
            successful: false,
            duration_ms: 123,
        })
        .unwrap();
        s.clear_library().unwrap();
        let first = s.session_timeline("chronology", 0).unwrap();
        assert_eq!(first.len(), 50);
        assert_eq!(first[0]["sequence"], 1);
        assert_eq!(first[1]["sequence"], 2);
        assert_eq!(first[1]["exitCode"], 7);
        assert_eq!(first[1]["successful"], false);
        assert_eq!(first[1]["durationMs"], 123);
        assert_eq!(first[0]["itemId"], first[1]["itemId"]);
        assert_eq!(first[0]["text"], "git status\n# 🛰");
        let second = s.session_timeline("chronology", 50).unwrap();
        assert_eq!(second.len(), 2);
        assert_eq!(second[0]["sequence"], 51);
        assert!(s.session_timeline("other", 0).unwrap().is_empty());
    }
    fn capture(s: &mut Store, text: &str, source: &str, dir: &str, time: i64, session: &str) {
        s.capture(&Capture {
            kind: "command".into(),
            text: text.into(),
            source: source.into(),
            timestamp: time,
            directory: dir.into(),
            session: session.into(),
            sequence: Some(time),
            representations: vec![],
        })
        .unwrap();
    }
    #[test]
    fn filters_match_the_same_occurrence_and_show_its_metadata() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        capture(
            &mut s,
            "git status",
            "PowerShell",
            "C:/project",
            100,
            "session-a",
        );
        capture(&mut s, "git status", "CMD", "C:/other", 10000, "session-b");
        let mut options = SearchOptions {
            source: "powershell".into(),
            directory: "project".into(),
            from: Some(100),
            until: Some(101),
            session: "session-a".into(),
            ..Default::default()
        };
        let items = s
            .search_items("git", "command", 50, 0, "", &options)
            .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].source, "PowerShell");
        assert_eq!(items[0].directory, "C:/project");
        options.directory = "other".into();
        assert!(s
            .search_items("", "all", 50, 0, "", &options)
            .unwrap()
            .is_empty());
        options.directory = "project".into();
        options.from = Some(101);
        options.until = Some(102);
        assert!(s
            .search_items("", "all", 50, 0, "", &options)
            .unwrap()
            .is_empty());
        options.until = Some(100);
        assert!(s.search_items("", "all", 50, 0, "", &options).is_err());
    }
    #[test]
    fn fuzzy_ranking_pagination_and_labels_are_consistent() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        capture(&mut s, "git checkout", "PS", "", 1, "one");
        capture(&mut s, "git checkouts", "PS", "", 2, "two");
        capture(&mut s, "git chekout", "PS", "", 3, "three");
        let options = SearchOptions {
            fuzzy: true,
            ..Default::default()
        };
        let all = s
            .search_items("checkout", "all", 50, 0, "", &options)
            .unwrap();
        assert_eq!(
            all.iter().map(|i| i.text.as_str()).collect::<Vec<_>>(),
            vec!["git checkout", "git checkouts", "git chekout"]
        );
        assert_eq!(
            s.search_items("checkout", "all", 1, 1, "", &options)
                .unwrap()[0]
                .id,
            all[1].id
        );
        let id = &all[0].id;
        s.set_organization(id, &["Rust".into()], &["Work".into()])
            .unwrap();
        assert!(s
            .set_organization(id, &["changed".into()], &["bad,name".into()])
            .is_err());
        let tagged = SearchOptions {
            tag: "rust".into(),
            collection: "work".into(),
            ..Default::default()
        };
        assert_eq!(
            s.search_items("", "all", 50, 0, "", &tagged).unwrap()[0].id,
            *id
        );
        assert_eq!(s.labels(id).unwrap().len(), 2);
        assert_eq!(s.command_sessions().unwrap().len(), 3);
    }
    #[test]
    fn saved_searches_round_trip_all_options_and_replace_names() {
        let s = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut search = SavedSearch {
            name: "Project".into(),
            query: "gti".into(),
            filter: "command".into(),
            options: SearchOptions {
                fuzzy: true,
                pinned: Some(false),
                from: Some(10),
                until: Some(20),
                directory: "project".into(),
                tag: "work".into(),
                ..Default::default()
            },
        };
        s.save_search(&search).unwrap();
        search.name = "PROJECT".into();
        search.query = "git".into();
        s.save_search(&search).unwrap();
        let saved = s.saved_searches().unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].query, "git");
        assert_eq!(saved[0].options.pinned, Some(false));
        assert!(saved[0].options.fuzzy);
        assert_eq!(saved[0].options.until, Some(20));
        s.delete_search("project").unwrap();
        assert!(s.saved_searches().unwrap().is_empty());
    }
    #[test]
    fn undo_restores_labels_and_fuzzy_index() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        capture(&mut s, "archive recovery", "PS", "", 1, "one");
        let id = s.list("", "all", 1, 0).unwrap()[0].id.clone();
        s.set_organization(&id, &["important".into()], &["project".into()])
            .unwrap();
        s.delete_with_recovery(&id, 10, 100).unwrap();
        assert!(s.labels(&id).unwrap().is_empty());
        assert!(s.fuzzy_ids("recovry").unwrap().is_empty());
        s.undo_delete(&id, 20).unwrap();
        assert_eq!(s.labels(&id).unwrap().len(), 2);
        assert_eq!(s.fuzzy_ids("recovry").unwrap(), vec![id]);
    }
    #[test]
    fn fuzzy_index_matches_typos_prefixes_and_is_erased_on_delete() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        s.capture(&Capture {
            kind: "text".into(),
            text: "git checkout archiver 🛰".into(),
            source: "test".into(),
            timestamp: 1,
            directory: "".into(),
            session: "".into(),
            sequence: None,
            representations: vec![],
        })
        .unwrap();
        let id = s.list("", "all", 50, 0).unwrap()[0].id.clone();
        for q in ["gti chec", "git chekout", "archivr", "git"] {
            assert_eq!(s.fuzzy_ids(q).unwrap(), vec![id.clone()], "{q}");
        }
        assert!(s.fuzzy_ids("unknown").unwrap().is_empty());
        s.delete(&id).unwrap();
        assert!(s.fuzzy_ids("archivr").unwrap().is_empty());
        let count: i64 = s
            .conn
            .query_row("SELECT COUNT(*) FROM terms", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
    #[test]
    fn snippet_edits_recovery_and_saved_search_restart_preserve_search_state() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("target");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("search-{}.sqlite", uuid::Uuid::new_v4()));
        let mut s = Store::open(&path).unwrap();
        let id = s
            .save_snippet(None, "Oldname", "text", "obsoleteword", 1)
            .unwrap();
        s.save_snippet(Some(&id), "Newname", "text", "replacementword", 2)
            .unwrap();
        assert!(s.fuzzy_ids("obsoleteword").unwrap().is_empty());
        assert_eq!(s.fuzzy_ids("replacementwrd").unwrap(), vec![id.clone()]);
        s.set_organization(&id, &["snippet".into()], &[]).unwrap();
        s.delete_with_recovery(&id, 10, 100).unwrap();
        s.undo_delete(&id, 20).unwrap();
        assert_eq!(s.labels(&id).unwrap().len(), 1);
        s.save_search(&SavedSearch {
            name: "Notes".into(),
            query: "replacementwrd".into(),
            filter: "snippets".into(),
            options: SearchOptions {
                fuzzy: true,
                ..Default::default()
            },
        })
        .unwrap();
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(s.saved_searches().unwrap()[0].name, "Notes");
        assert_eq!(s.fuzzy_ids("replacementwrd").unwrap(), vec![id]);
        drop(s);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    #[ignore = "local synthetic timing, not a production performance guarantee"]
    fn measure_search_on_ten_thousand_items() {
        let mut s = Store::open(std::path::Path::new(":memory:")).unwrap();
        let started = std::time::Instant::now();
        for n in 0..10000 {
            capture(
                &mut s,
                &format!("git checkout branch{n}"),
                "PS",
                "C:/project",
                n + 1,
                "session",
            );
        }
        println!("10,000 captures and indexing: {:?}", started.elapsed());
        for fuzzy in [false, true] {
            let options = SearchOptions {
                fuzzy,
                source: "PS".into(),
                directory: "project".into(),
                ..Default::default()
            };
            let started = std::time::Instant::now();
            let rows = s
                .search_items(
                    if fuzzy { "gti chekout" } else { "checkout" },
                    "command",
                    50,
                    0,
                    "",
                    &options,
                )
                .unwrap();
            assert_eq!(rows.len(), 50);
            println!("50 results, fuzzy={fuzzy}: {:?}", started.elapsed());
        }
    }
}
