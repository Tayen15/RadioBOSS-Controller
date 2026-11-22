use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CasterHubChartTrack {
    pub rank: usize,
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub duration_formatted: Option<String>,
    pub total_plays: u64,
    pub unique_stations: u64,
    pub movement: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CasterHubSessionStats {
    pub session_time_formatted: String,
    pub session_seconds: u64,
    pub lifetime_airtime_hours: f64,
    pub songs_today: u64,
    pub session_songs_dispatched: u64,
    pub session_cache_saved_mb: f64,
    pub station_hash_short: String,
    pub station_name: String,
    pub active_stations_online: u64,
    pub total_airtime_hours: f64,
    pub total_songs_dispatched: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CasterHubCrowdMetadata {
    pub clean_title: String,
    pub clean_artist: String,
    pub original_title: String,
    pub votes_count: u64,
    pub is_crowd_cleaned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CasterHubListenerRequest {
    pub id: String,
    pub sender_name: String,
    pub message: String,
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub thumbnail_url: Option<String>,
    pub duration_formatted: Option<String>,
    pub status: String,
    pub created_at: String,
}
