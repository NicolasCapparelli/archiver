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
}
pub fn session_path(root: &Path, session: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(session.trim_matches(['{', '}']))
        .map_err(|_| "Invalid shell session ID")?;
    Ok(root.join("shell-sessions").join(format!("{session}.json")))
}
pub fn read_session(root: &Path, session: &str) -> Result<Session> {
    let path = session_path(root, session)?;
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
