//! Derived file-drop formats supplement image replay; archived payloads stay unchanged.
use crate::store::{Representation, Result};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub fn file_drop(paths: &[PathBuf]) -> Result<Representation> {
    if paths.is_empty() {
        return Err("No files to copy".into());
    }
    // DROPFILES: pFiles, POINT, fNC, fWide; UTF-16 paths end with two NULs.
    let mut bytes = vec![0u8; 20];
    bytes[..4].copy_from_slice(&20u32.to_le_bytes());
    bytes[16..20].copy_from_slice(&1u32.to_le_bytes());
    for path in paths {
        let text = path.to_str().ok_or("File path is not Unicode")?;
        if !path.is_absolute() || text.contains('\0') {
            return Err("Choose absolute file paths".into());
        }
        for unit in text.encode_utf16().chain(Some(0)) {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
    }
    bytes.extend_from_slice(&[0, 0]);
    Ok(Representation {
        format: "CF_HDROP".into(),
        data: bytes,
    })
}

pub fn with_image_file(reps: Vec<Representation>, cache: &Path) -> Result<Vec<Representation>> {
    if reps.iter().any(|r| r.format == "CF_HDROP")
        || !reps.iter().any(|r| {
            matches!(
                r.format.as_str(),
                "PNG" | "image/png" | "JFIF" | "CF_DIB" | "CF_DIBV5"
            )
        })
    {
        return Ok(reps);
    }
    let mut hash = Sha256::new();
    for rep in &reps {
        hash.update((rep.format.len() as u64).to_le_bytes());
        hash.update(rep.format.as_bytes());
        hash.update((rep.data.len() as u64).to_le_bytes());
        hash.update(&rep.data);
    }
    let path = cache.join(format!("archiver-image-{:x}.png", hash.finalize()));
    if !path.is_file() {
        let bytes = crate::preview::replay_png(&reps)?;
        std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
        let pending = cache.join(format!("{}.pending", uuid::Uuid::new_v4()));
        std::fs::write(&pending, bytes).map_err(|e| e.to_string())?;
        if let Err(error) = std::fs::rename(&pending, &path) {
            let _ = std::fs::remove_file(&pending);
            if !path.is_file() {
                return Err(error.to_string());
            }
        }
    }
    let mut output = reps;
    output.push(file_drop(&[path])?);
    output.push(Representation {
        format: "Preferred DropEffect".into(),
        data: 1u32.to_le_bytes().to_vec(),
    });
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explorer_drop_has_unicode_header_double_terminator_and_original_pixels() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../target/test-temp")
            .join(format!("archiver-replay-{}", uuid::Uuid::new_v4()));
        let image = image::DynamicImage::new_rgba8(3000, 1);
        let mut bytes = std::io::Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        let original = Representation {
            format: "PNG".into(),
            data: bytes.into_inner(),
        };
        let reps = with_image_file(vec![original.clone()], &root).unwrap();
        assert_eq!(reps[0].data, original.data);
        assert_eq!(&reps[1].data[..4], &20u32.to_le_bytes());
        assert_eq!(&reps[1].data[16..20], &1u32.to_le_bytes());
        assert_eq!(&reps[1].data[reps[1].data.len() - 4..], &[0, 0, 0, 0]);
        let units: Vec<_> = reps[1].data[20..]
            .chunks_exact(2)
            .map(|v| u16::from_le_bytes([v[0], v[1]]))
            .take_while(|v| *v != 0)
            .collect();
        let path = PathBuf::from(String::from_utf16(&units).unwrap());
        let decoded = image::open(&path).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (3000, 1));
        assert_eq!(reps[2].data, 1u32.to_le_bytes());
        assert_eq!(
            with_image_file(reps.clone(), &root).unwrap().len(),
            reps.len()
        );
        std::fs::remove_file(&path).unwrap();
        with_image_file(vec![original], &root).unwrap();
        assert!(path.is_file());
        let unicode = file_drop(&[root.join("😨 test.png"), root.join("two.png")]).unwrap();
        let units: Vec<_> = unicode.data[20..]
            .chunks_exact(2)
            .map(|v| u16::from_le_bytes([v[0], v[1]]))
            .collect();
        assert!(String::from_utf16(&units)
            .unwrap()
            .contains("😨 test.png\0"));
        assert!(file_drop(&[PathBuf::from("relative.png")]).is_err());
        assert!(with_image_file(
            vec![Representation {
                format: "PNG".into(),
                data: vec![1, 2, 3]
            }],
            &root
        )
        .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
