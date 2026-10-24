use crate::store::Representation;
use base64::Engine;
use std::io::Cursor;

pub fn image_representations(encoded: &str) -> Result<Vec<Representation>, String> {
    if encoded.len() > 8 * 1024 * 1024 { return Err("Sketch image exceeds the clipboard limit".into()); }
    let png = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_| "Invalid sketch image encoding")?;
    if !png.starts_with(b"\x89PNG\r\n\x1a\n") { return Err("Sketch image must be PNG".into()); }
    let dimensions = image::ImageReader::with_format(Cursor::new(&png), image::ImageFormat::Png)
        .into_dimensions().map_err(|e| e.to_string())?;
    if dimensions != (1200, 800) { return Err("Sketch image must be 1200 by 800 pixels".into()); }
    let image = image::load_from_memory_with_format(&png, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    let mut bmp = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image.to_rgb8()).write_to(&mut bmp, image::ImageFormat::Bmp).map_err(|e| e.to_string())?;
    let bytes = bmp.into_inner();
    Ok(vec![Representation { format: "PNG".into(), data: png }, Representation { format: "CF_DIB".into(), data: bytes[14..].to_vec() }])
}

#[cfg(test)]
mod tests {
    use super::*;
    fn encoded(width: u32, height: u32) -> String {
        let image = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(width, height, image::Rgb([255, 255, 255])));
        let mut out = Cursor::new(Vec::new()); image.write_to(&mut out, image::ImageFormat::Png).unwrap();
        base64::engine::general_purpose::STANDARD.encode(out.into_inner())
    }
    #[test]
    fn validates_dimensions_and_emits_png_and_dib() {
        assert!(image_representations("bad").is_err());
        assert!(image_representations(&encoded(10, 10)).is_err());
        let reps = image_representations(&encoded(1200, 800)).unwrap();
        assert_eq!(reps[0].format, "PNG"); assert_eq!(reps[1].format, "CF_DIB");
        assert_eq!(i32::from_le_bytes(reps[1].data[4..8].try_into().unwrap()), 1200);
        assert_eq!(i32::from_le_bytes(reps[1].data[8..12].try_into().unwrap()), 800);
    }
    #[test]
    fn sketch_copy_retry_preserves_one_permanent_image() {
        let directory = std::env::temp_dir().join(format!("archiver-sketch-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let mut store = crate::store::Store::open(&directory.join("archive.sqlite")).unwrap();
        let capture = crate::store::Capture { kind: "image".into(), text: "Sketchpad".into(), source: "Archiver Sketchpad".into(), timestamp: 1, directory: String::new(), session: String::new(), sequence: None, representations: image_representations(&encoded(1200, 800)).unwrap() };
        store.capture_clipboard(&capture).unwrap(); store.capture_clipboard(&capture).unwrap();
        assert_eq!(store.stats().unwrap().items, 1);
        drop(store);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
