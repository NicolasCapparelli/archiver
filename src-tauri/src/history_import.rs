use crate::store::{Capture, Result};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, io::Read, path::Path};

// PSReadLine appends one backtick to each embedded newline. Clink imports use
// its supported `history --bare` export, never the internal tombstone format.
pub fn parse(text: &str, format: &str) -> Result<Vec<String>> {
    if !["powershell", "clink"].contains(&format) {
        return Err("Choose PowerShell or Clink export".into());
    }
    let mut commands = Vec::new();
    let mut pending = String::new();
    for line in text.trim_start_matches('\u{feff}').lines() {
        if format == "powershell" && line.ends_with('`') {
            pending.push_str(&line[..line.len() - 1]);
            pending.push('\n');
        } else {
            pending.push_str(line);
            if !pending.is_empty() {
                commands.push(std::mem::take(&mut pending));
            }
        }
    }
    if !pending.is_empty() {
        return Err(
            "History ends with an incomplete multiline record; close the shell and export again"
                .into(),
        );
    }
    if commands.iter().any(|s| s.len() > 1024 * 1024) {
        return Err("A history command exceeds 1 MB".into());
    }
    Ok(commands)
}
pub fn read(path: &Path, format: &str, timestamp: i64) -> Result<Vec<Capture>> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    std::fs::File::open(&path)
        .map_err(|e| e.to_string())?
        .take(64 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("History import limit is 64 MB".into());
    }
    let text = String::from_utf8(bytes).map_err(|_| "Export history as UTF-8")?;
    let commands = parse(&text, format)?;
    let origin = format!("{}:{}", format, path.to_string_lossy());
    let mut counts = HashMap::<String, i64>::new();
    Ok(commands
        .into_iter()
        .map(|text| {
            let hash = format!(
                "{:x}",
                Sha256::digest(format!("{origin}\0{text}").as_bytes())
            );
            let sequence = counts.entry(hash.clone()).or_default();
            *sequence += 1;
            Capture {
                kind: "command".into(),
                text,
                source: format!(
                    "{} history import (execution time unknown)",
                    if format == "powershell" {
                        "PowerShell"
                    } else {
                        "CMD / Clink"
                    }
                ),
                timestamp,
                directory: String::new(),
                session: format!("import:{hash}"),
                sequence: Some(*sequence),
                representations: vec![],
            }
        })
        .collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn powershell_multiline_and_incomplete_records() {
        assert_eq!(
            parse("\u{feff}echo 🛰`\r\necho two\r\nplain\r\n", "powershell").unwrap(),
            vec!["echo 🛰\necho two", "plain"]
        );
        assert!(parse("unfinished`\n", "powershell").is_err());
        assert_eq!(
            parse("echo literal`\r\necho | pipe\r\n", "clink").unwrap(),
            vec!["echo literal`", "echo | pipe"]
        );
    }
}
