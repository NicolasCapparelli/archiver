//! A snapshot of distinct clipboard records, independent of queue and library filters.
use crate::{
    replay,
    store::{Representation, Result, Store},
};
use std::path::{Path, PathBuf};

pub struct Clip {
    kind: String,
    text: String,
    reps: Vec<Representation>,
}

pub fn snapshot(store: &Store, count: usize) -> Result<Vec<Clip>> {
    if !(1..=9).contains(&count) {
        return Err("Choose 1–9 recent clips".into());
    }
    let mut rows = store.list("", "clipboard_recent", count as i64, 0)?;
    if rows.is_empty() {
        return Err("No clipboard clips in history".into());
    }
    rows.reverse();
    rows.into_iter()
        .map(|row| {
            let reps = if matches!(row.kind.as_str(), "image" | "files") {
                store.payload(&row.id)?
            } else {
                vec![]
            };
            Ok(Clip {
                kind: row.kind,
                text: row.text,
                reps,
            })
        })
        .collect()
}

pub fn prepare_snapshot(clips: Vec<Clip>, cache: &Path) -> Result<(Vec<Representation>, String)> {
    if clips
        .iter()
        .all(|clip| !matches!(clip.kind.as_str(), "image" | "files"))
    {
        return Ok((
            vec![],
            clips
                .iter()
                .map(|clip| clip.text.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
        ));
    }
    if clips
        .iter()
        .any(|clip| !matches!(clip.kind.as_str(), "image" | "files"))
    {
        return Err("These recent clips mix text and images/files, which cannot be combined in one paste. Paste them individually; nothing was sent.".into());
    }
    if clips.len() == 1 {
        let mut reps = replay::with_image_file(clips.into_iter().next().unwrap().reps, cache)?;
        let drop = reps
            .iter()
            .find(|r| r.format == "CF_HDROP")
            .ok_or("No file-drop representation for this clip")?;
        validate_paths(&drop_paths(&drop.data)?)?;
        reps.retain(|rep| rep.format != "Preferred DropEffect");
        reps.push(Representation {
            format: "Preferred DropEffect".into(),
            data: 1u32.to_le_bytes().to_vec(),
        });
        return Ok((reps, String::new()));
    }
    let mut paths = Vec::new();
    for clip in clips {
        let reps = replay::with_image_file(clip.reps, cache)?;
        let drop = reps
            .iter()
            .find(|r| r.format == "CF_HDROP")
            .ok_or("No file-drop representation for this clip")?;
        paths.extend(drop_paths(&drop.data)?);
    }
    validate_paths(&paths)?;
    Ok((
        vec![
            replay::file_drop(&paths)?,
            Representation {
                format: "Preferred DropEffect".into(),
                data: 1u32.to_le_bytes().to_vec(),
            },
        ],
        String::new(),
    ))
}

fn validate_paths(paths: &[PathBuf]) -> Result<()> {
    for path in paths {
        if !path.exists() {
            return Err(format!("Copied file no longer exists: {}", path.display()));
        }
    }
    Ok(())
}

#[cfg(test)]
fn prepare(store: &Store, count: usize, cache: &Path) -> Result<(Vec<Representation>, String)> {
    prepare_snapshot(snapshot(store, count)?, cache)
}

fn drop_paths(data: &[u8]) -> Result<Vec<PathBuf>> {
    if data.len() < 20 {
        return Err("Truncated file-drop data".into());
    }
    let offset = u32::from_le_bytes(data[..4].try_into().unwrap()) as usize;
    if data[16..20] != 1u32.to_le_bytes()
        || offset < 20
        || offset > data.len()
        || (data.len() - offset) % 2 != 0
    {
        return Err("Unsupported file-drop data; copy these files again".into());
    }
    let units: Vec<_> = data[offset..]
        .chunks_exact(2)
        .map(|v| u16::from_le_bytes([v[0], v[1]]))
        .collect();
    if !units.ends_with(&[0, 0]) {
        return Err("Unterminated file-drop data".into());
    }
    let mut paths = Vec::new();
    for part in units.split(|v| *v == 0).take_while(|p| !p.is_empty()) {
        let path = PathBuf::from(String::from_utf16(part).map_err(|e| e.to_string())?);
        if !path.is_absolute() {
            return Err("File-drop path must be absolute".into());
        }
        paths.push(path);
    }
    if paths.is_empty() {
        return Err("No files in clipboard item".into());
    }
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Capture;
    #[test]
    fn recent_snapshot_is_chronological_and_does_not_include_commands_or_snippets() {
        let root = std::env::temp_dir().join(format!("archiver-recent-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let mut store = Store::open(&root.join("archive.sqlite")).unwrap();
        for (text, time) in [("first 😨", 1000), ("second\nline", 4000), ("third", 7000)] {
            store
                .capture_clipboard(&Capture {
                    kind: "text".into(),
                    text: text.into(),
                    source: "test.exe".into(),
                    timestamp: time,
                    directory: String::new(),
                    session: String::new(),
                    sequence: None,
                    representations: vec![],
                })
                .unwrap();
        }
        store
            .save_snippet(None, "Saved snippet", "text", "not clipboard", 9000)
            .unwrap();
        store
            .capture(&Capture {
                kind: "command".into(),
                text: "not clipboard either".into(),
                source: "pwsh.exe".into(),
                timestamp: 9500,
                directory: String::new(),
                session: "test-shell".into(),
                sequence: Some(1),
                representations: vec![],
            })
            .unwrap();
        assert_eq!(prepare(&store, 2, &root).unwrap().1, "second\nline\nthird");
        assert_eq!(
            prepare(&store, 9, &root).unwrap().1,
            "first 😨\nsecond\nline\nthird"
        );
        assert!(prepare(&store, 0, &root).is_err());
        assert!(prepare(&store, 10, &root).is_err());
        store
            .capture_clipboard(&Capture {
                kind: "image".into(),
                text: String::new(),
                source: "test.exe".into(),
                timestamp: 10000,
                directory: String::new(),
                session: String::new(),
                sequence: None,
                representations: vec![Representation {
                    format: "PNG".into(),
                    data: vec![1],
                }],
            })
            .unwrap();
        assert!(prepare(&store, 2, &root).unwrap_err().contains("mix text"));
        assert_eq!(store.list("", "clips", 10, 0).unwrap().len(), 4);
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn file_lists_round_trip_unicode_and_reject_malformed_payloads() {
        let paths = vec![
            std::env::temp_dir().join("😨 one.png"),
            std::env::temp_dir().join("two.png"),
        ];
        assert_eq!(
            drop_paths(&replay::file_drop(&paths).unwrap().data).unwrap(),
            paths
        );
        assert!(drop_paths(&[0; 3]).is_err());
        let mut truncated = replay::file_drop(&paths).unwrap().data;
        truncated.truncate(truncated.len() - 2);
        assert!(drop_paths(&truncated).is_err());
        let mut data = replay::file_drop(&paths).unwrap().data;
        data[..4].copy_from_slice(&1u32.to_le_bytes());
        assert!(drop_paths(&data).is_err());
    }
    #[test]
    fn recent_images_and_files_form_one_drop_in_history_order() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../target/test-temp")
            .join(format!("archiver-recent-files-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let mut store = Store::open(&root.join("archive.sqlite")).unwrap();
        assert!(prepare(&store, 4, &root).is_err());
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 3)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let image = Representation {
            format: "PNG".into(),
            data: png.into_inner(),
        };
        let file = root.join("original.txt");
        std::fs::write(&file, "preserve me").unwrap();
        for (kind, time, representations) in [
            ("image", 1000, vec![image]),
            (
                "files",
                4000,
                vec![replay::file_drop(&[file.clone()]).unwrap()],
            ),
        ] {
            store
                .capture_clipboard(&Capture {
                    kind: kind.into(),
                    text: String::new(),
                    source: "test.exe".into(),
                    timestamp: time,
                    directory: String::new(),
                    session: String::new(),
                    sequence: None,
                    representations,
                })
                .unwrap();
        }
        let (reps, text) = prepare(&store, 4, &root).unwrap();
        assert!(text.is_empty());
        let paths = drop_paths(&reps[0].data).unwrap();
        assert_eq!(paths.len(), 2);
        assert_eq!(image::open(&paths[0]).unwrap().height(), 3);
        assert_eq!(paths[1], file);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "preserve me");
        assert_eq!(reps[1].data, 1u32.to_le_bytes());
        let (single, _) = prepare(&store, 1, &root).unwrap();
        assert_eq!(single.last().unwrap().data, 1u32.to_le_bytes());
        assert_eq!(drop_paths(&single[0].data).unwrap(), vec![file.clone()]);
        std::fs::remove_file(&file).unwrap();
        assert!(prepare(&store, 1, &root).unwrap_err().contains("no longer exists"));
        assert!(prepare(&store, 4, &root)
            .unwrap_err()
            .contains("no longer exists"));
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }
}
