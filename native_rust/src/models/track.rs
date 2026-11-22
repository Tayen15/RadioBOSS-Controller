use serde::{Deserialize, Serialize};

/// Unified track metadata model across Search, Recommendations, Sets, and Cue Deck.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrackItem {
    pub video_id: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub duration_seconds: Option<u64>,
    pub duration_formatted: Option<String>,
    pub thumbnail_url: Option<String>,
    pub url: String,
    pub year: Option<String>,
    pub genre: Option<String>,
}

impl TrackItem {
    pub fn primary_artist(&self) -> &str {
        self.artists
            .first()
            .map(|s| s.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Unknown Artist")
    }

    pub fn artists_joined(&self) -> String {
        if self.artists.is_empty() {
            "Unknown Artist".to_string()
        } else {
            self.artists.join(", ")
        }
    }

    pub fn display_duration(&self) -> &str {
        self.duration_formatted.as_deref().unwrap_or("00:00")
    }
}

/// Queue dispatch log entry stored permanently in SQLite `queue_history`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryItem {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub artists: Vec<String>,
    pub thumbnail_url: Option<String>,
    pub pos: i32,
    pub timestamp: String,
    pub status: String,
}

/// Local SQLite playlist collection folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSet {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: f64,
    pub updated_at: f64,
    pub track_count: usize,
}

/// Item stored inside a local `PlaylistSet`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSetItem {
    pub id: String,
    pub set_id: String,
    pub video_id: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: u64,
    pub duration_formatted: String,
    pub order_index: i32,
}

impl From<&PlaylistSetItem> for TrackItem {
    fn from(item: &PlaylistSetItem) -> Self {
        TrackItem {
            video_id: item.video_id.clone(),
            title: item.title.clone(),
            artists: item.artists.clone(),
            album: item.album.clone(),
            duration_seconds: Some(item.duration_seconds),
            duration_formatted: Some(item.duration_formatted.clone()),
            thumbnail_url: item.thumbnail_url.clone(),
            url: format!("https://music.youtube.com/watch?v={}", item.video_id),
            year: item.year.clone(),
            genre: item.genre.clone(),
        }
    }
}

/// Cached MP3 & DJ airplay tracking record from `cached_tracks`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedTrackItem {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub year: String,
    pub genre: String,
    pub file_path: Option<String>,
    pub thumbnail_url: String,
    pub duration_seconds: u64,
    pub duration_formatted: String,
    pub file_size_bytes: u64,
    pub file_size_mb: f64,
    pub play_count: u64,
    pub last_played_at: Option<f64>,
    pub last_played_relative: String,
    pub is_cached: bool,
    pub rotation_status: String, // "heavy" | "medium" | "light"
    pub rank: Option<usize>,
}

impl From<&CachedTrackItem> for TrackItem {
    fn from(c: &CachedTrackItem) -> Self {
        let artists = if c.artist.is_empty() {
            vec![]
        } else {
            vec![c.artist.clone()]
        };
        TrackItem {
            video_id: c.video_id.clone(),
            title: c.title.clone(),
            artists,
            album: if c.album.is_empty() { None } else { Some(c.album.clone()) },
            duration_seconds: Some(c.duration_seconds),
            duration_formatted: Some(c.duration_formatted.clone()),
            thumbnail_url: if c.thumbnail_url.is_empty() {
                None
            } else {
                Some(c.thumbnail_url.clone())
            },
            url: format!("https://music.youtube.com/watch?v={}", c.video_id),
            year: if c.year.is_empty() { None } else { Some(c.year.clone()) },
            genre: if c.genre.is_empty() { None } else { Some(c.genre.clone()) },
        }
    }
}

/// Artist airplay summary for Smart DJ Recommendations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DjArtistStat {
    pub artist: String,
    pub play_count: u64,
    pub track_count: u64,
}

/// Disk cache storage statistics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CacheStats {
    pub cache_dir: String,
    pub storage_dir: String,
    pub db_path: String,
    pub total_files: usize,
    pub total_size_bytes: u64,
    pub total_size_mb: f64,
    pub max_cache_size_mb: u64,
    pub used_percent: f64,
    pub auto_cleanup_cache: bool,
}

/// Announcer talking points and cue sheet metadata.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TalkingPoints {
    pub intro_talk_window: String,
    pub outro_talk_window: String,
    pub station_id_cue: String,
    pub vibe: String,
    pub vibe_badge: String,
    pub vibe_category: String,
    pub key_lyric_quote: String,
    pub intro_script: String,
    pub outro_script: String,
    pub broadcaster_tips: Vec<String>,
    pub play_count: u64,
}

/// Full lyrics & cue sheet response for a track.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsResponse {
    pub video_id: String,
    pub has_lyrics: bool,
    pub lyrics: String,
    pub source: String,
    pub talking_points: TalkingPoints,
}
