use once_cell::sync::Lazy;
use regex::Regex;

static RE_BRACKET_TAGS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\s*[\(\[](?:(?:\d{4}\s*)?remaster(?:ed)?|remaster(?:ed)?(?:\s*\d{4})?|deluxe(?: edition)?|anniversary edition|bonus track|official (?:audio|video|music video)|lyric video|live(?: at [^\)\]]+)?|original mix|extended mix|radio edit)[\)\]]",
    )
    .unwrap()
});

static RE_DASH_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\s*-\s*(?:(?:\d{4}\s*)?remaster(?:ed)?|remaster(?:ed)?(?:\s*\d{4})?|official (?:audio|video)|deluxe edition).*$",
    )
    .unwrap()
});

static RE_TRAILING_DASH: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+-\s*$").unwrap());
static RE_MULTI_SPACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s{2,}").unwrap());
static RE_FS_UNSAFE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"[\\/*?:"<>|]"#).unwrap());

/// Strips unwanted suffixes such as `(2008 Remastered)`, `(Official Video)`, etc.
pub fn clean_broadcast_title(raw_title: &str) -> String {
    if raw_title.trim().is_empty() {
        return String::new();
    }
    let step1 = RE_BRACKET_TAGS.replace_all(raw_title, "");
    let step2 = RE_DASH_SUFFIX.replace_all(&step1, "");
    let step3 = RE_TRAILING_DASH.replace_all(&step2, "");
    let step4 = RE_MULTI_SPACE.replace_all(step3.trim(), " ");
    step4.trim().to_string()
}

/// Sanitizes filename strings safely for Windows & Linux filesystems.
pub fn sanitize_filename(name: &str) -> String {
    RE_FS_UNSAFE.replace_all(name, "").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_broadcast_title_strips_noise() {
        assert_eq!(
            clean_broadcast_title("Yellow (2008 Remastered)"),
            "Yellow"
        );
        assert_eq!(
            clean_broadcast_title("Dan... [Official Music Video]"),
            "Dan..."
        );
        assert_eq!(
            clean_broadcast_title("Fix You - Deluxe Edition"),
            "Fix You"
        );
    }

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename(r#"Artis: "Lagu"? *Test*"#), "Artis Lagu Test");
    }
}
