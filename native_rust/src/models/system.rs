use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSpecs {
    pub os_name: String,
    pub cpu_cores: usize,
    pub ram_gb: f64,
    pub is_low_spec: bool,
    pub recommended_preset: String, // "low_spec" | "studio_high"
    pub recommended_loudnorm: bool,
    pub recommended_bitrate: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAsset {
    pub name: String,
    pub size: u64,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub tag_name: String,
    pub update_available: bool,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: String,
    pub html_url: String,
    pub asset: Option<UpdateAsset>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdateDownloadState {
    Idle,
    Downloading,
    Downloaded,
    Error,
}

#[derive(Debug, Clone)]
pub struct UpdateDownloadStatus {
    pub state: UpdateDownloadState,
    pub progress: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_mbps: f64,
    pub file_path: Option<String>,
    pub file_name: Option<String>,
    pub error: Option<String>,
}

impl Default for UpdateDownloadStatus {
    fn default() -> Self {
        Self {
            state: UpdateDownloadState::Idle,
            progress: 0.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_mbps: 0.0,
            file_path: None,
            file_name: None,
            error: None,
        }
    }
}
