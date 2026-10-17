use crate::store::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub session: String,
    pub source: String,
    pub pid: u32,
    pub directory: String,
    pub ready: bool,
    pub insertion: bool,
    pub updated_at: i64,
    #[serde(default)]
    pub protocol_version: u32,
}
pub fn session_path(root: &Path, session: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(session.trim_matches(['{', '}']))
        .map_err(|_| "Invalid shell session ID")?;
    Ok(root.join("shell-sessions").join(format!("{session}.json")))
}
pub fn read_session(root: &Path, session: &str) -> Result<Session> {
    let path = session_path(root, session)?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 65536 {
        return Err("Shell report exceeds 64 KiB".into());
    }
    let data: Session = serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if data.session != session {
        return Err("Shell session metadata does not match its identity".into());
    }
    Ok(data)
}
pub fn sessions(root: &Path) -> Vec<Session> {
    let Ok(entries) = std::fs::read_dir(root.join("shell-sessions")) else {
        return vec![];
    };
    let mut sessions: Vec<_> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension()?.to_str()? != "json" {
                return None;
            }
            let session = path.file_stem()?.to_str()?;
            read_session(root, session).ok()
        })
        .collect();
    sessions.sort_by_key(|session| std::cmp::Reverse(session.updated_at));
    sessions
}
pub const PROTOCOL_VERSION: u32 = 1;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Readiness {
    pub stale: bool,
    pub compatible: bool,
    pub capture: &'static str,
    pub insertion: &'static str,
    pub advice: &'static str,
}
pub fn readiness(session: &Session, now: i64) -> Readiness {
    let stale = session.updated_at <= 0
        || session.updated_at > now.saturating_add(60_000)
        || now.saturating_sub(session.updated_at) > 120_000;
    let compatible = session.protocol_version == PROTOCOL_VERSION;
    let unix = session.source.starts_with("WSL / ")
        || ["Bash", "Zsh", "Fish"]
            .iter()
            .any(|s| session.source.contains(s));
    Readiness {
        stale,
        compatible,
        capture: if !compatible {
            "Adapter update required"
        } else if stale {
            "Old report; capture unconfirmed"
        } else if session.ready {
            "At prompt; capture ready"
        } else {
            "Command running; awaiting next prompt"
        },
        insertion: if !compatible {
            "Blocked: adapter version mismatch"
        } else if unix || !cfg!(windows) {
            "Unavailable on this platform"
        } else if !session.insertion {
            "Editor callback unavailable"
        } else if !session.ready {
            "Wait for the prompt"
        } else if stale {
            "Refresh the prompt first"
        } else {
            "Ready; inserts text without Enter"
        },
        advice: if !compatible {
            "Repair the adapters and restart this shell."
        } else if stale {
            "Reports update at prompts, not continuously. Finish the command or press Enter at an empty prompt to refresh."
        } else if unix {
            "Unix hooks are experimental; Windows cannot verify WSL process IDs. Command insertion is Windows PowerShell/Clink only."
        } else if !session.insertion {
            "PowerShell needs PSReadLine; CMD needs Clink. Restart after setup and check profile-loading policy."
        } else {
            "Open Librarian from the destination terminal before inserting."
        },
    }
}
pub fn insertion_request(id: &str, expires: u64, text: &str) -> Result<String> {
    if text.is_empty() || text.len() > 1024 * 1024 {
        return Err("Command insertion needs 1 byte to 1 MB of text".into());
    }
    if text
        .chars()
        .any(|c| c.is_control() && !matches!(c, '\r' | '\n' | '\t'))
    {
        return Err("Command contains unsupported control characters".into());
    }
    Ok(format!("{id} {expires}\n{text}"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn readiness_distinguishes_legacy_idle_busy_future_and_wsl_reports() {
        let mut session:Session=serde_json::from_value(serde_json::json!({"session":uuid::Uuid::new_v4().to_string(),"source":"PowerShell","pid":1,"directory":"","ready":true,"insertion":true,"updatedAt":100_000})).unwrap();
        assert!(!readiness(&session, 100_001).compatible);
        session.protocol_version = PROTOCOL_VERSION;
        assert!(readiness(&session, 220_001).stale);
        assert!(!readiness(&session, 100_001).stale);
        session.ready = false;
        assert!(readiness(&session, 100_001).capture.contains("running"));
        session.source = "WSL / Bash 5".into();
        session.ready = true;
        assert!(readiness(&session, 100_001)
            .insertion
            .contains("Unavailable"));
        session.updated_at = 900_000;
        assert!(readiness(&session, 100_001).stale);
        assert!(include_str!("../../integrations/archiver.ps1").contains("protocolVersion = 1"));
        assert!(include_str!("../../integrations/archiver.lua").contains("\"protocolVersion\":1"));
    }
    #[test]
    fn multiline_requests_preserve_input_without_adding_submission() {
        let text = "Write-Output '🛰'\r\nGet-Date\n";
        assert_eq!(
            insertion_request("request", 123, text).unwrap(),
            format!("request 123\n{text}")
        );
        assert!(insertion_request("id", 1, "\x1b[20~").is_err());
        assert!(insertion_request("id", 1, "").is_err());
    }
    #[test]
    fn session_paths_reject_traversal() {
        assert!(session_path(Path::new("root"), "../secret").is_err());
        assert!(session_path(Path::new("root"), &uuid::Uuid::new_v4().to_string()).is_ok());
    }
}
