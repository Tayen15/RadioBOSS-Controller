use serde::{Deserialize, Serialize};

/// Format modes for broadcast track titles sent to RadioBOSS.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TitleFormatMode {
    #[default]
    RadiobossNative,
    ArtistTitle,
    TitleArtist,
    TitleOnly,
    Custom,
}

impl TitleFormatMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RadiobossNative => "radioboss_native",
            Self::ArtistTitle => "artist_title",
            Self::TitleArtist => "title_artist",
            Self::TitleOnly => "title_only",
            Self::Custom => "custom",
        }
    }

    pub fn from_str_lossy(val: &str) -> Self {
        match val {
            "radioboss_native" => Self::RadiobossNative,
            "artist_title" => Self::ArtistTitle,
            "title_artist" => Self::TitleArtist,
            "title_only" => Self::TitleOnly,
            "custom" => Self::Custom,
            _ => Self::RadiobossNative,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::RadiobossNative => "Standar RadioBOSS (%artist - %title)",
            Self::ArtistTitle => "Nama Artis - Judul Lagu",
            Self::TitleArtist => "Judul Lagu - Nama Artis",
            Self::TitleOnly => "Hanya Judul Lagu",
            Self::Custom => "Format Kustom Manual",
        }
    }

    pub fn example(&self) -> &'static str {
        match self {
            Self::RadiobossNative => "NIKI - Backburner",
            Self::ArtistTitle => "Coldplay - Yellow",
            Self::TitleArtist => "Yellow - Coldplay",
            Self::TitleOnly => "Yellow",
            Self::Custom => "{artist} - {title}",
        }
    }
}

/// Persistent application configuration stored in SQLite and mirrored to config.json.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub radioboss_host: String,
    pub radioboss_port: u16,
    pub radioboss_password: String,
    pub title_format_mode: String,
    pub custom_title_format: String,
    pub server_port: u16,
    pub enable_loudnorm: bool,
    pub custom_cache_dir: String,
    pub custom_data_dir: String,
    pub max_cache_size_mb: u64,
    pub auto_cleanup_cache: bool,
    pub audio_quality: String,
    pub target_playlist_tab: String,
    pub available_playlist_tabs: Vec<String>,
    pub casterhub_url: String,
    pub enable_telemetry: bool,
    pub station_public_name: String,
    pub enable_crowd_metadata: bool,
    pub public_stream_url: String,
    pub enable_online_requests: bool,
    pub total_airtime_seconds: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            radioboss_host: "http://127.0.0.1".to_string(),
            radioboss_port: 9000,
            radioboss_password: String::new(),
            title_format_mode: "radioboss_native".to_string(),
            custom_title_format: "{artist} - {title}".to_string(),
            server_port: 8000,
            enable_loudnorm: true,
            custom_cache_dir: String::new(),
            custom_data_dir: String::new(),
            max_cache_size_mb: 2048,
            auto_cleanup_cache: true,
            audio_quality: "320k".to_string(),
            target_playlist_tab: String::new(),
            available_playlist_tabs: Vec::new(),
            casterhub_url: "https://rcb.oktaa.my.id".to_string(),
            enable_telemetry: true,
            station_public_name: String::new(),
            enable_crowd_metadata: true,
            public_stream_url: String::new(),
            enable_online_requests: true,
            total_airtime_seconds: 0,
        }
    }
}

impl AppConfig {
    /// Formats a broadcast title according to the active `title_format_mode`.
    pub fn format_title(&self, artist: &str, title: &str) -> String {
        let clean_artist = artist.trim();
        let clean_title = title.trim();
        match self.title_format_mode.as_str() {
            "radioboss_native" | "artist_title" => {
                if clean_artist.is_empty() {
                    clean_title.to_string()
                } else {
                    format!("{clean_artist} - {clean_title}")
                }
            }
            "title_artist" => {
                if clean_artist.is_empty() {
                    clean_title.to_string()
                } else {
                    format!("{clean_title} - {clean_artist}")
                }
            }
            "title_only" => clean_title.to_string(),
            "custom" => self
                .custom_title_format
                .replace("{artist}", clean_artist)
                .replace("{title}", clean_title),
            _ => {
                if clean_artist.is_empty() {
                    clean_title.to_string()
                } else {
                    format!("{clean_artist} - {clean_title}")
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_title_modes() {
        let mut cfg = AppConfig::default();
        assert_eq!(cfg.format_title("NIKI", "Backburner"), "NIKI - Backburner");

        cfg.title_format_mode = "title_artist".to_string();
        assert_eq!(cfg.format_title("Coldplay", "Yellow"), "Yellow - Coldplay");

        cfg.title_format_mode = "title_only".to_string();
        assert_eq!(cfg.format_title("Coldplay", "Yellow"), "Yellow");

        cfg.title_format_mode = "custom".to_string();
        cfg.custom_title_format = "[LIVE] {artist} :: {title}".to_string();
        assert_eq!(
            cfg.format_title("Sheila On 7", "Dan"),
            "[LIVE] Sheila On 7 :: Dan"
        );
    }
}
