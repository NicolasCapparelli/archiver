use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub shortcut: String,
    pub excluded_apps: Vec<String>,
    pub recovery_hours: u32,
    pub ocr_interval_seconds: u32,
    pub ocr_on_capture: bool,
    pub librarian_state_memory: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Super+Period".into(),
            excluded_apps: vec![],
            recovery_hours: 0,
            ocr_interval_seconds: 7200,
            ocr_on_capture: true,
            librarian_state_memory: false,
        }
    }
}
impl Settings {
    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        let previous: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        let mut settings: Self = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if previous.get("ocrOnCapture").is_none() && settings.ocr_interval_seconds == 60 {
            settings.ocr_interval_seconds = 7200;
        }
        Ok(settings)
    }
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let pending = path.with_extension("pending");
        std::fs::write(
            &pending,
            serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(pending, path).map_err(|e| e.to_string())
    }
    pub fn normalized(mut self) -> Result<Self, String> {
        self.shortcut = self.shortcut.trim().to_string();
        if self.ocr_interval_seconds != 0 && !(30..=86400).contains(&self.ocr_interval_seconds) {
            return Err("OCR interval must be 30–86400 seconds, or 0 to disable".into());
        }
        if self.recovery_hours > 24 * 365 {
            return Err("Recovery window must be between 0 and 8760 hours".into());
        }
        if self.shortcut.is_empty() {
            return Err("Choose a shortcut with a modifier and a key".into());
        }
        let mut apps = vec![];
        for app in self.excluded_apps {
            let app = app.trim().to_lowercase();
            if app.is_empty() {
                continue;
            }
            if app.contains(['/', '\\', '*', '?']) {
                return Err("Use an exact executable name, such as waveform-cli.exe".into());
            }
            if !apps.contains(&app) {
                apps.push(app);
            }
        }
        self.excluded_apps = apps;
        Ok(self)
    }
    pub fn excludes(&self, source: &str) -> bool {
        self.excluded_apps
            .iter()
            .any(|app| app.eq_ignore_ascii_case(source))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn automatic_ocr_interval_defaults_and_bounds() {
        assert!(Settings::default().ocr_on_capture);
        assert_eq!(
            serde_json::from_str::<Settings>("{}")
                .unwrap()
                .ocr_interval_seconds,
            7200
        );
        for value in [0, 30, 60, 86400] {
            assert!(Settings {
                ocr_interval_seconds: value,
                ..Default::default()
            }
            .normalized()
            .is_ok());
        }
        for value in [1, 29, 86401, u32::MAX] {
            assert!(Settings {
                ocr_interval_seconds: value,
                ..Default::default()
            }
            .normalized()
            .is_err());
        }
    }
    #[test]
    fn old_fast_ocr_schedule_migrates_without_overriding_custom_preferences() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("target");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("ocr-migration-{}.json", uuid::Uuid::new_v4()));
        for (json, expected) in [
            (r#"{"ocrIntervalSeconds":60}"#, 7200),
            (r#"{"ocrIntervalSeconds":0}"#, 0),
            (r#"{"ocrIntervalSeconds":3600}"#, 3600),
            (r#"{"ocrIntervalSeconds":60,"ocrOnCapture":false}"#, 60),
        ] {
            std::fs::write(&path, json).unwrap();
            assert_eq!(
                Settings::load(&path).unwrap().ocr_interval_seconds,
                expected
            );
        }
        assert!(!Settings::load(&path).unwrap().ocr_on_capture);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn exclusions_are_exact_case_insensitive_and_opt_in() {
        let shortcut: tauri_plugin_global_shortcut::Shortcut =
            Settings::default().shortcut.parse().unwrap();
        assert!(!shortcut.mods.is_empty());
        assert!(!Settings::default().excludes("waveform-cli.exe"));
        let settings = Settings {
            excluded_apps: vec![" Waveform-CLI.exe ".into(), "waveform-cli.exe".into()],
            ..Settings::default()
        }
        .normalized()
        .unwrap();
        assert_eq!(settings.excluded_apps.len(), 1);
        assert!(settings.excludes("WAVEFORM-CLI.EXE"));
        assert!(!settings.excludes("other-waveform-cli.exe"));
        assert!(Settings {
            excluded_apps: vec!["*.exe".into()],
            ..Settings::default()
        }
        .normalized()
        .is_err());
    }
    #[test]
    fn settings_survive_restart_and_old_files_get_defaults() {
        let test_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("target");
        std::fs::create_dir_all(&test_dir).unwrap();
        let path = test_dir.join(format!("archiver-settings-{}.json", uuid::Uuid::new_v4()));
        let settings = Settings {
            shortcut: "Ctrl+Alt+KeyA".into(),
            excluded_apps: vec!["waveform-cli.exe".into()],
            librarian_state_memory: true,
            ..Settings::default()
        };
        settings.save(&path).unwrap();
        let loaded = Settings::load(&path).unwrap();
        assert_eq!(loaded.shortcut, settings.shortcut);
        assert!(loaded.excludes("waveform-cli.exe"));
        assert!(loaded.librarian_state_memory);
        Settings::default().save(&path).unwrap();
        assert!(Settings::load(&path).unwrap().excluded_apps.is_empty());
        assert!(!Settings::load(&path).unwrap().librarian_state_memory);
        assert!(!serde_json::from_str::<Settings>("{}").unwrap().librarian_state_memory);
        std::fs::remove_file(path).unwrap();
        assert_eq!(
            serde_json::from_str::<Settings>("{}").unwrap().shortcut,
            "Ctrl+Super+Period"
        );
    }
}
