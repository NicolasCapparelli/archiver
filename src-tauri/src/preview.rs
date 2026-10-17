//! Derived previews never alter archived representations. Decode on a worker with limits.
use crate::store::{Representation, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub url: String,
    pub width: u32,
    pub height: u32,
}
fn u32_at(data: &[u8], offset: usize) -> Result<u32> {
    data.get(offset..offset + 4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .ok_or("Truncated bitmap header".into())
}
fn dib_bmp(data: &[u8]) -> Result<Vec<u8>> {
    let header = u32_at(data, 0)? as usize;
    if ![40, 52, 56, 108, 124].contains(&header) || data.len() < header {
        return Err("Unsupported bitmap header".into());
    }
    let bits = u16::from_le_bytes(data[14..16].try_into().unwrap());
    let compression = u32_at(data, 16)?;
    let colors = u32_at(data, 32)? as usize;
    let palette = if colors != 0 {
        colors
    } else if bits <= 8 {
        1usize << bits
    } else {
        0
    };
    if palette > 256 {
        return Err("Invalid bitmap palette".into());
    }
    let masks = if header == 40 {
        match compression {
            3 => 12,
            6 => 16,
            _ => 0,
        }
    } else {
        0
    };
    let mut pixel_offset = header + masks + palette * 4;
    // Packed V5 DIBs can contain an embedded color profile before the pixels.
    if header == 124 {
        let profile = u32_at(data, 112)? as usize;
        let size = u32_at(data, 116)? as usize;
        if size > 0 && profile == pixel_offset {
            pixel_offset = profile.checked_add(size).ok_or("Invalid bitmap profile")?;
        }
    }
    if pixel_offset >= data.len() || data.len() > 128 * 1024 * 1024 {
        return Err("Invalid or oversized bitmap".into());
    }
    let mut bmp = Vec::with_capacity(data.len() + 14);
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&((data.len() + 14) as u32).to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&((pixel_offset + 14) as u32).to_le_bytes());
    bmp.extend_from_slice(data);
    Ok(bmp)
}
fn decode(rep: &Representation) -> Result<DynamicImage> {
    let data = match rep.format.as_str() {
        "CF_DIB" | "CF_DIBV5" => dib_bmp(&rep.data)?,
        _ => rep.data.clone(),
    };
    let mut reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(32768);
    limits.max_image_height = Some(32768);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|e| e.to_string())
}
pub fn generate(reps: &[Representation], thumbnail: bool) -> Result<Preview> {
    let mut failure = "No supported image representation".to_string();
    for format in ["PNG", "image/png", "JFIF", "CF_DIBV5", "CF_DIB"] {
        if let Some(rep) = reps.iter().find(|rep| rep.format == format) {
            match decode(rep) {
                Ok(image) => {
                    let (width, height) = (image.width(), image.height());
                    let image = if thumbnail {
                        image.thumbnail(256, 256)
                    } else {
                        image
                    };
                    let mut bytes = Cursor::new(Vec::new());
                    image
                        .write_to(&mut bytes, ImageFormat::Png)
                        .map_err(|e| e.to_string())?;
                    return Ok(Preview {
                        url: format!(
                            "data:image/png;base64,{}",
                            STANDARD.encode(bytes.into_inner())
                        ),
                        width,
                        height,
                    });
                }
                Err(error) => failure = error,
            }
        }
    }
    Err(failure)
}
pub fn replay_png(reps: &[Representation]) -> Result<Vec<u8>> {
    png_bytes(reps, false)
}
#[derive(Clone, Copy, Deserialize)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
pub fn region_png(reps: &[Representation], region: Region) -> Result<Vec<u8>> {
    if ![region.x, region.y, region.width, region.height].iter().all(|v| v.is_finite())
        || region.x < 0.0 || region.y < 0.0 || region.width <= 0.0 || region.height <= 0.0
        || region.x + region.width > 1.0 + 1e-9 || region.y + region.height > 1.0 + 1e-9
    { return Err("Choose a nonempty region inside the image".into()); }
    let mut failure = "No supported image representation".to_string();
    for format in ["PNG", "image/png", "JFIF", "CF_DIBV5", "CF_DIB"] {
        if let Some(rep) = reps.iter().find(|rep| rep.format == format) {
            match decode(rep) {
                Ok(image) => {
                    let x = (region.x * image.width() as f64).round() as u32;
                    let y = (region.y * image.height() as f64).round() as u32;
                    let right = ((region.x + region.width) * image.width() as f64).round().min(image.width() as f64) as u32;
                    let bottom = ((region.y + region.height) * image.height() as f64).round().min(image.height() as f64) as u32;
                    if right <= x || bottom <= y { return Err("Select at least one image pixel".into()); }
                    let mut bytes = Cursor::new(Vec::new());
                    image.crop_imm(x, y, right - x, bottom - y).write_to(&mut bytes, ImageFormat::Png).map_err(|e| e.to_string())?;
                    return Ok(bytes.into_inner());
                }
                Err(error) => failure = error,
            }
        }
    }
    Err(failure)
}
pub fn ocr_png(reps: &[Representation]) -> Result<Vec<u8>> {
    png_bytes(reps, true)
}
fn png_bytes(reps: &[Representation], thumbnail: bool) -> Result<Vec<u8>> {
    let mut failure = "No supported image representation".to_string();
    for format in ["PNG", "image/png", "JFIF", "CF_DIBV5", "CF_DIB"] {
        if let Some(rep) = reps.iter().find(|rep| rep.format == format) {
            match decode(rep) {
                Ok(image) => {
                    let image = if thumbnail { image.thumbnail(2048, 2048) } else { image };
                    let mut bytes = Cursor::new(Vec::new());
                    image
                        .write_to(&mut bytes, ImageFormat::Png)
                        .map_err(|e| e.to_string())?;
                    return Ok(bytes.into_inner());
                }
                Err(e) => failure = e,
            }
        }
    }
    Err(failure)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn region_crops_original_pixels_and_rejects_invalid_bounds() {
        let image = image::RgbImage::from_fn(10, 8, |x, y| image::Rgb([x as u8, y as u8, 42]));
        let mut data = Cursor::new(Vec::new());
        image.write_to(&mut data, ImageFormat::Png).unwrap();
        let reps = vec![Representation { format: "PNG".into(), data: data.into_inner() }];
        let region = Region { x: 0.2, y: 0.25, width: 0.4, height: 0.5 };
        let crop = image::load_from_memory(&region_png(&reps, region).unwrap()).unwrap().to_rgb8();
        assert_eq!(crop.dimensions(), (4, 4));
        assert_eq!(crop.get_pixel(0, 0).0, [2, 2, 42]);
        assert_eq!(crop.get_pixel(3, 3).0, [5, 5, 42]);
        for bad in [Region { x: -0.1, ..region }, Region { width: 0.0, ..region }, Region { x: 0.9, ..region }, Region { y: f64::NAN, ..region }] {
            assert!(region_png(&reps, bad).is_err());
        }
    }
    #[test]
    fn bottom_up_and_top_down_dib_preserve_pixels() {
        for height in [2i32, -2] {
            let mut dib = vec![0u8; 40];
            dib[0..4].copy_from_slice(&40u32.to_le_bytes());
            dib[4..8].copy_from_slice(&1u32.to_le_bytes());
            dib[8..12].copy_from_slice(&height.to_le_bytes());
            dib[12..14].copy_from_slice(&1u16.to_le_bytes());
            dib[14..16].copy_from_slice(&24u16.to_le_bytes());
            let rows = if height > 0 {
                vec![255, 0, 0, 0, 0, 0, 255, 0]
            } else {
                vec![0, 0, 255, 0, 255, 0, 0, 0]
            };
            dib.extend(rows);
            let image = decode(&Representation {
                format: "CF_DIB".into(),
                data: dib,
            })
            .unwrap()
            .to_rgb8();
            assert_eq!(image.get_pixel(0, 0).0, [255, 0, 0]);
            assert_eq!(image.get_pixel(0, 1).0, [0, 0, 255]);
        }
    }
    #[test]
    fn png_thumbnail_is_bounded_and_original_dimensions_survive() {
        let image = DynamicImage::new_rgba8(600, 300);
        let mut png = Cursor::new(Vec::new());
        image.write_to(&mut png, ImageFormat::Png).unwrap();
        let reps = vec![Representation {
            format: "PNG".into(),
            data: png.into_inner(),
        }];
        let preview = generate(&reps, true).unwrap();
        assert_eq!((preview.width, preview.height), (600, 300));
        let data = STANDARD
            .decode(preview.url.split_once(',').unwrap().1)
            .unwrap();
        let thumb = image::load_from_memory(&data).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (256, 128));
        assert_eq!(
            image::load_from_memory(
                &STANDARD
                    .decode(
                        generate(&reps, false)
                            .unwrap()
                            .url
                            .split_once(',')
                            .unwrap()
                            .1
                    )
                    .unwrap()
            )
            .unwrap()
            .width(),
            600
        );
    }
    #[test]
    fn malformed_dib_is_rejected_and_png_fallback_works() {
        assert!(dib_bmp(&[]).is_err());
        assert!(generate(
            &[Representation {
                format: "CF_DIB".into(),
                data: vec![0; 40]
            }],
            true
        )
        .is_err());
        let mut png = Cursor::new(Vec::new());
        DynamicImage::new_rgba8(2, 3)
            .write_to(&mut png, ImageFormat::Png)
            .unwrap();
        let preview = generate(
            &[
                Representation {
                    format: "CF_DIB".into(),
                    data: vec![0; 40],
                },
                Representation {
                    format: "PNG".into(),
                    data: png.into_inner(),
                },
            ],
            true,
        )
        .unwrap();
        assert_eq!((preview.width, preview.height), (2, 3));
    }
}
