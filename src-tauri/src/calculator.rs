//! Immutable calculations use normal archived text + a versioned representation.
use crate::store::{Capture, Representation, Result, Store};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const FORMAT: &str = "application/vnd.archiver.calculation+json";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Calculation {
    pub version: u32,
    pub expression: String,
    pub result: f64,
    pub mode: String,
    pub variables: BTreeMap<String, f64>,
    pub answer: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCalculation {
    pub id: String,
    pub timestamp: i64,
    pub calculation: Calculation,
}
impl Calculation {
    fn validate(&self) -> Result<()> {
        if self.version != 1 || self.expression.trim().is_empty() || self.expression.chars().count() > 1024
            || !["deg", "rad"].contains(&self.mode.as_str()) || !self.result.is_finite()
            || !self.answer.is_finite() || self.variables.len() > 64
            || self.variables.iter().any(|(key, value)| key.is_empty() || key.len() > 32
                || !key.as_bytes()[0].is_ascii_alphabetic()
                || !key.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_') || !value.is_finite()) {
            return Err("Invalid calculation or unsupported calculation version".into());
        }
        Ok(())
    }
}
impl Store {
    pub fn save_calculation(&mut self, calculation: Calculation, now: i64) -> Result<SavedCalculation> {
        calculation.validate()?;
        let context = calculation.variables.iter().map(|(name, value)| format!("{name}={value}")).collect::<Vec<_>>().join(", ");
        // A submission is a distinct historical record even when its text/result repeats.
        let submission = uuid::Uuid::new_v4().to_string();
        let capture = Capture {
            kind: "text".into(),
            text: format!("{} = {}\nCalculator · {}\nVariables: {}\nPrevious answer: {}", calculation.expression, calculation.result, calculation.mode.to_uppercase(), if context.is_empty() { "none" } else { &context }, calculation.answer),
            source: "Archiver Calculator".into(), timestamp: now,
            directory: String::new(), session: String::new(), sequence: None,
            representations: vec![Representation { format: FORMAT.into(), data: serde_json::to_vec(&calculation).map_err(|e| e.to_string())? }, Representation { format: "application/vnd.archiver.calculation-submission".into(), data: submission.into_bytes() }],
        };
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        Self::capture_tx(&tx, &capture)?;
        let id: String = tx.query_row("SELECT id FROM items WHERE fingerprint=?", [crate::store::capture_fingerprint(&capture)], |r| r.get(0)).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM library WHERE item_id=?", [&id]).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(SavedCalculation { id, timestamp: now, calculation })
    }
    pub fn calculations(&self, offset: i64) -> Result<Vec<SavedCalculation>> {
        if offset < 0 { return Err("Invalid calculation history offset".into()); }
        let mut statement = self.conn.prepare("SELECT i.id,MAX(e.last_seen),r.data FROM items i JOIN representations r ON r.item_id=i.id AND r.format=? JOIN events e ON e.item_id=i.id GROUP BY i.id ORDER BY MAX(e.last_seen) DESC,i.rowid DESC LIMIT 50 OFFSET ?").map_err(|e| e.to_string())?;
        let rows = statement.query_map(params![FORMAT, offset], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, Vec<u8>>(2)?))).map_err(|e| e.to_string())?;
        rows.map(|row| {
            let (id, timestamp, bytes) = row.map_err(|e| e.to_string())?;
            let calculation: Calculation = serde_json::from_slice(&bytes).map_err(|e| format!("Unreadable archived calculation: {e}"))?;
            calculation.validate()?;
            Ok(SavedCalculation { id, timestamp, calculation })
        }).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn calculation_pages_are_bounded_and_ties_keep_submission_order() {
        let mut store = Store::open(std::path::Path::new(":memory:")).unwrap();
        let calculation = Calculation { version: 1, expression: "1+1".into(), result: 2.0, mode: "deg".into(), variables: BTreeMap::new(), answer: 0.0 };
        let mut ids = Vec::new();
        for _ in 0..52 { ids.push(store.save_calculation(calculation.clone(), 100).unwrap().id); }
        let first = store.calculations(0).unwrap();
        let second = store.calculations(50).unwrap();
        assert_eq!(first.len(), 50);
        assert_eq!(second.len(), 2);
        assert_eq!(first[0].id, ids[51]);
        assert_eq!(second[1].id, ids[0]);
        assert!(store.search_items("", "all", 100, 0, "", &crate::search::SearchOptions { library_only: true, ..Default::default() }).unwrap().is_empty());
    }
    #[test]
    fn calculation_history_survives_archive_lifecycle_and_does_not_enter_recent_clipboard() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("target/test-temp").join(format!("calculator-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("archive.sqlite");
        let mut store = Store::open(&path).unwrap();
        let calculation = Calculation { version: 1, expression: "radius*2*pi".into(), result: 6.0 * std::f64::consts::PI, mode: "rad".into(), variables: BTreeMap::from([("radius".into(), 3.0)]), answer: 9.0 };
        let first = store.save_calculation(calculation.clone(), 100).unwrap();
        store.save_calculation(calculation.clone(), 101).unwrap();
        assert_eq!(store.calculations(0).unwrap().len(), 2);
        assert_eq!(store.list("radius", "all", 50, 0).unwrap().len(), 2);
        assert!(store.payload(&first.id).unwrap().is_empty());
        assert!(store.replace_item_text(&first.id, "replacement", 102).is_err());
        assert_eq!(store.calculations(0).unwrap().len(), 2);
        assert!(store.list("", "clipboard_recent", 9, 0).unwrap().is_empty());
        store.clear_library().unwrap();
        assert_eq!(store.calculations(0).unwrap().len(), 2);
        store.delete_with_recovery(&first.id, 200, 1000).unwrap();
        assert_eq!(store.calculations(0).unwrap().len(), 1);
        store.undo_delete(&first.id, 201).unwrap();
        let export = root.join("export.jsonl");
        let digest = store.export_jsonl(&export).unwrap();
        std::fs::write(export.with_extension("jsonl.sha256"), digest).unwrap();
        assert!(std::fs::read_to_string(&export).unwrap().contains(FORMAT));
        let mut imported = Store::open(std::path::Path::new(":memory:")).unwrap();
        let prepared = imported.prepare_import(&export, false, None).unwrap();
        imported.apply_import(prepared, false).unwrap();
        let prepared = imported.prepare_import(&export, false, None).unwrap();
        imported.apply_import(prepared, false).unwrap();
        assert_eq!(imported.calculations(0).unwrap().len(), 2);
        assert_eq!(imported.calculations(0).unwrap()[0].calculation.answer, 9.0);
        assert!(imported.list("", "clipboard_recent", 9, 0).unwrap().is_empty());
        let backup = root.join("backup.sqlite");
        store.backup_verified(&backup).unwrap();
        let saved = Store::open(&backup).unwrap();
        assert_eq!(saved.calculations(0).unwrap()[0].calculation.variables["radius"], 3.0);
        drop(saved); drop(store);
        let store = Store::open(&path).unwrap();
        assert_eq!(store.calculations(0).unwrap().len(), 2);
        assert!(store.calculations(50).unwrap().is_empty());
        assert!(store.calculations(-1).is_err());
        drop(store);
        let mut invalid = calculation; invalid.result = f64::INFINITY;
        assert!(invalid.validate().is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
