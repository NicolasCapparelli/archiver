use crate::store::{Result, Store};
use std::path::Path;
impl Store {
    pub fn storage_health(&self, check: bool) -> Result<serde_json::Value> {
        let read = |sql: &str| {
            self.conn
                .query_row(sql, [], |r| r.get::<_, i64>(0))
                .map_err(|e| e.to_string())
        };
        let integrity = if check {
            self.conn
                .query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?
        } else {
            "Not checked; choose Check storage".into()
        };
        let journal: String = self
            .conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(
            serde_json::json!({"pages":read("PRAGMA page_count")?,"pageBytes":read("PRAGMA page_size")?,"freePages":read("PRAGMA freelist_count")?,"items":read("SELECT count(*) FROM items")?,"occurrences":read("SELECT count(*) FROM events")?,"integrity":integrity,"journal":journal}),
        )
    }
}
/// Stage the existing installer verbatim. Merely preparing instructions never edits profiles.
pub fn prepare_repair(root: &Path) -> Result<serde_json::Value> {
    if !cfg!(windows) {
        return Err(
            "Use integrations/install-unix.sh from the project on Unix; WSL hooks are experimental"
                .into(),
        );
    }
    let folder = root.join("integration-repair");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    for (name, source) in [
        (
            "install.ps1",
            include_str!("../../integrations/install.ps1"),
        ),
        (
            "archiver.ps1",
            include_str!("../../integrations/archiver.ps1"),
        ),
        (
            "archiver.lua",
            include_str!("../../integrations/archiver.lua"),
        ),
    ] {
        std::fs::write(folder.join(name), source).map_err(|e| e.to_string())?;
    }
    let script = folder.join("install.ps1");
    let command = format!(
        "& '{}' -SkipCmd",
        script.display().to_string().replace('\'', "''")
    );
    Ok(serde_json::json!({"previewCommand":format!("{command} -WhatIf"),"repairCommand":command}))
}
pub fn repair_powershell(root: &Path, approved: bool) -> Result<String> {
    if !approved {
        return Err("Approve the PowerShell profile repair first".into());
    }
    prepare_repair(root)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("powershell.exe")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(root.join("integration-repair/install.ps1"))
            .arg("-SkipCmd")
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        if !output.status.success() {
            return Err(format!(
                "Repair failed; review the output before retrying: {text}"
            ));
        }
        Ok(text)
    }
    #[cfg(not(windows))]
    {
        Err("PowerShell repair requires Windows".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn storage_checks_are_read_only_and_repair_requires_explicit_approval() {
        let store = Store::open(Path::new(":memory:")).unwrap();
        let changes = store.conn.total_changes();
        assert_eq!(store.storage_health(true).unwrap()["integrity"], "ok");
        assert_eq!(store.conn.total_changes(), changes);
        assert!(repair_powershell(Path::new("unused"), false).is_err());
    }
    #[test]
    #[cfg(windows)]
    fn staged_installer_repairs_only_isolated_profiles_and_keeps_original_backup() {
        use std::os::windows::process::CommandExt;
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("target/test-temp")
            .join(format!("repair-{}", uuid::Uuid::new_v4()));
        let profiles = root.join("documents");
        let profile = profiles.join("WindowsPowerShell/profile.ps1");
        std::fs::create_dir_all(profile.parent().unwrap()).unwrap();
        std::fs::write(&profile, "# my existing profile\r\n").unwrap();
        let plan = prepare_repair(&root).unwrap();
        assert!(plan["previewCommand"]
            .as_str()
            .unwrap()
            .ends_with("-SkipCmd -WhatIf"));
        assert_eq!(
            std::fs::read_to_string(&profile).unwrap(),
            "# my existing profile\r\n"
        );
        let run = || {
            std::process::Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                ])
                .arg(root.join("integration-repair/install.ps1"))
                .arg("-SkipCmd")
                .arg("-ProfileRoot")
                .arg(&profiles)
                .arg("-InstallRoot")
                .arg(root.join("adapters"))
                .creation_flags(0x08000000)
                .output()
                .unwrap()
        };
        assert!(run().status.success());
        let first = std::fs::read(&profile).unwrap();
        assert!(run().status.success());
        assert_eq!(std::fs::read(&profile).unwrap(), first);
        assert_eq!(
            std::fs::read_to_string(profile.with_extension("ps1.archiver-backup")).unwrap(),
            "# my existing profile\r\n"
        );
        assert!(std::fs::read_to_string(root.join("adapters/archiver.ps1"))
            .unwrap()
            .contains("protocolVersion = 1"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
