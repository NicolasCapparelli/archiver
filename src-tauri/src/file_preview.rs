use crate::{
    preview,
    store::{Representation, Result},
};
use std::{io::Read, path::Path};

pub fn content(path: &Path) -> Result<serde_json::Value> {
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    if matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "bmp") {
        let mut data = Vec::new();
        file.take(8 * 1024 * 1024 + 1)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
        if data.len() > 8 * 1024 * 1024 {
            return Err("Image file exceeds the 8 MB preview limit".into());
        }
        let image = preview::generate(
            &[Representation {
                format: "PNG".into(),
                data,
            }],
            true,
        )?;
        return Ok(serde_json::json!({"image":image}));
    }
    let mut data = Vec::new();
    (&mut file)
        .take(65537)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    let truncated = data.len() > 65536;
    data.truncate(65536);
    if data.contains(&0) {
        return Err("Binary file: text preview unavailable".into());
    }
    let text = String::from_utf8_lossy(&data);
    if text
        .chars()
        .filter(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
        .count()
        > 4
    {
        return Err("Binary file: text preview unavailable".into());
    }
    Ok(serde_json::json!({"text":text,"truncated":truncated}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_text_and_binary_detection() {
        let path = std::env::temp_dir().join(format!("archiver-file-{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&path, vec![b'x'; 70000]).unwrap();
        let preview = content(&path).unwrap();
        assert_eq!(preview["text"].as_str().unwrap().len(), 65536);
        assert_eq!(preview["truncated"], true);
        std::fs::write(&path, [0, 1, 2]).unwrap();
        assert!(content(&path).is_err());
        std::fs::remove_file(path).unwrap();
    }
}
