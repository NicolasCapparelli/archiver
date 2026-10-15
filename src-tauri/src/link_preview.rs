use crate::store::Result;
use std::io::Read;
pub fn fetch(text: &str) -> Result<String> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let url = url::Url::parse(text.trim()).map_err(|_| "Select an HTTP or HTTPS URL")?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP(S) URLs without embedded credentials can be previewed".into());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent("Archiver/0.1 URL preview")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let content = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !content.starts_with("text/html") {
        return Err("URL did not return an HTML page".into());
    }
    let mut bytes = Vec::new();
    response
        .take(256 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    title(&String::from_utf8_lossy(&bytes))
}
fn title(html: &str) -> Result<String> {
    let capture = regex::Regex::new(r"(?is)<title\b[^>]*>(.*?)</title>")
        .unwrap()
        .captures(html)
        .ok_or("No page title in the first 256 KB")?;
    let plain = regex::Regex::new(r"<[^>]*>")
        .unwrap()
        .replace_all(&capture[1], "")
        .into_owned();
    let plain = plain
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    Ok(plain
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(500)
        .collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn title_is_bounded_plain_text() {
        assert_eq!(title("<TITLE> A &amp; <b>B</b> </TITLE>").unwrap(), "A & B");
        assert!(title("no title").is_err());
        assert_eq!(
            title(&format!("<title>{}</title>", "x".repeat(1000)))
                .unwrap()
                .len(),
            500
        );
    }
}
