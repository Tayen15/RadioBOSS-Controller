use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackAction {
    Play,
    Pause,
    Stop,
    Next,
}

impl PlaybackAction {
    pub fn as_cmd(&self) -> &'static str {
        match self {
            Self::Play => "play",
            Self::Pause => "pause",
            Self::Stop => "stop",
            Self::Next => "next",
        }
    }
}

/// Active RadioBOSS track status returned by `playbackinfo`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NowPlayingTrack {
    pub title: String,
    pub duration: Option<String>,
    pub position: Option<String>,
    pub status: String, // "playing" | "paused" | "stopped"
    pub listeners: Option<u32>,
}

/// Overall RadioBOSS connection & playback state.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RadioBossStatus {
    pub connected: bool,
    pub now_playing: Option<NowPlayingTrack>,
    pub error: Option<String>,
}

/// Upcoming track entry from RadioBOSS `getplaylist2`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistItem {
    pub index: usize,
    pub artist: String,
    pub title: String,
    pub display_title: String,
    pub duration: String,
    pub start_time: String,
    pub filename: String,
    pub is_playing: bool,
}

/// 1:1 RadioBOSS Playlist Tabs discovery snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TabsResponse {
    pub success: bool,
    pub active_tab: String,
    pub active_index: i32,
    pub available_tabs: Vec<String>,
    pub is_synced: bool,
}
