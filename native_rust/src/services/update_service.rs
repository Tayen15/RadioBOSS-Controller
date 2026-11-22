use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use futures_util::StreamExt;
use reqwest::Client;
use serde_json::Value;

use crate::models::system::{
    UpdateAsset, UpdateCheckResult, UpdateDownloadState, UpdateDownloadStatus,
};
use crate::models::APP_VERSION;

const GITHUB_API_URL: &str =
    "https://api.github.com/repos/Tayen15/RadioBOSS-Controller/releases/latest";

#[derive(Clone)]
pub struct UpdateService {
    client: Client,
    download_status: Arc<Mutex<UpdateDownloadStatus>>,
}

impl Default for UpdateService {
    fn default() -> Self {
        Self::new()
    }
}

impl UpdateService {
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent(format!("RadioBOSSCaster/{APP_VERSION}"))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            client,
            download_status: Arc::new(Mutex::new(UpdateDownloadStatus::default())),
        }
    }

    pub fn get_download_status(&self) -> UpdateDownloadStatus {
        self.download_status.lock().unwrap().clone()
    }

    pub async fn check_for_updates(&self) -> UpdateCheckResult {
        let resp = match self
            .client
            .get(GITHUB_API_URL)
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return UpdateCheckResult {
                    current_version: APP_VERSION.to_string(),
                    latest_version: APP_VERSION.to_string(),
                    release_name: "Gagal terhubung ke server pembaruan".to_string(),
                    html_url: "https://github.com/Tayen15/RadioBOSS-Controller/releases".to_string(),
                    error: Some(e.to_string()),
                    ..Default::default()
                };
            }
        };

        if !resp.status().is_success() {
            return UpdateCheckResult {
                current_version: APP_VERSION.to_string(),
                latest_version: APP_VERSION.to_string(),
                release_name: "Belum ada rilis resmi".to_string(),
                html_url: "https://github.com/Tayen15/RadioBOSS-Controller/releases".to_string(),
                ..Default::default()
            };
        }

        let data: Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                return UpdateCheckResult {
                    current_version: APP_VERSION.to_string(),
                    latest_version: APP_VERSION.to_string(),
                    error: Some(e.to_string()),
                    ..Default::default()
                };
            }
        };

        let tag_name = data
            .get("tag_name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let raw_latest = tag_name.trim_start_matches(['v', 'V']).to_string();
        let update_available = parse_semver(&raw_latest) > parse_semver(APP_VERSION);

        let chosen_asset = Self::select_asset(data.get("assets").and_then(|a| a.as_array()));

        UpdateCheckResult {
            current_version: APP_VERSION.to_string(),
            latest_version: if raw_latest.is_empty() {
                APP_VERSION.to_string()
            } else {
                raw_latest
            },
            tag_name,
            update_available,
            release_name: data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Rilis Terbaru")
                .to_string(),
            release_notes: data
                .get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            published_at: data
                .get("published_at")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            html_url: data
                .get("html_url")
                .and_then(|v| v.as_str())
                .unwrap_or("https://github.com/Tayen15/RadioBOSS-Controller/releases")
                .to_string(),
            asset: chosen_asset,
            error: None,
        }
    }

    fn select_asset(assets: Option<&Vec<Value>>) -> Option<UpdateAsset> {
        let list = assets?;
        let priorities = if cfg!(target_os = "windows") {
            vec![
                "RCBStudio-Setup-x64.exe",
                "RadioBOSSCaster-Setup-x64.exe",
                "RadioBOSSCaster-Windows-x64.exe",
                "RadioBOSSCaster.exe",
            ]
        } else {
            vec![
                "RCBStudio-Linux-x64.deb",
                "RCBStudio-Linux-x64.tar.gz",
                "RadioBOSSCaster-Portable-Linux-x64.tar.gz",
                "RadioBOSSCaster-Linux-x64",
            ]
        };

        for p in &priorities {
            if let Some(a) = list
                .iter()
                .find(|v| v.get("name").and_then(|n| n.as_str()) == Some(*p))
            {
                return Self::parse_asset(a);
            }
        }
        list.first().and_then(Self::parse_asset)
    }

    fn parse_asset(v: &Value) -> Option<UpdateAsset> {
        Some(UpdateAsset {
            name: v.get("name")?.as_str()?.to_string(),
            size: v.get("size").and_then(|s| s.as_u64()).unwrap_or(0),
            download_url: v.get("browser_download_url")?.as_str()?.to_string(),
        })
    }

    pub async fn start_download(&self, asset: UpdateAsset) {
        {
            let mut st = self.download_status.lock().unwrap();
            st.state = UpdateDownloadState::Downloading;
            st.progress = 0.0;
            st.downloaded_bytes = 0;
            st.total_bytes = asset.size;
            st.file_name = Some(asset.name.clone());
            st.error = None;
        }

        let target_path = std::env::temp_dir().join(&asset.name);
        let resp = match self.client.get(&asset.download_url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                let mut st = self.download_status.lock().unwrap();
                st.state = UpdateDownloadState::Error;
                st.error = Some(format!("HTTP {}", r.status()));
                return;
            }
            Err(e) => {
                let mut st = self.download_status.lock().unwrap();
                st.state = UpdateDownloadState::Error;
                st.error = Some(e.to_string());
                return;
            }
        };

        let total = resp.content_length().unwrap_or(asset.size);
        let mut file = match std::fs::File::create(&target_path) {
            Ok(f) => f,
            Err(e) => {
                let mut st = self.download_status.lock().unwrap();
                st.state = UpdateDownloadState::Error;
                st.error = Some(e.to_string());
                return;
            }
        };

        let mut stream = resp.bytes_stream();
        let started = Instant::now();
        let mut downloaded: u64 = 0;

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    if let Err(e) = file.write_all(&bytes) {
                        let mut st = self.download_status.lock().unwrap();
                        st.state = UpdateDownloadState::Error;
                        st.error = Some(e.to_string());
                        return;
                    }
                    downloaded += bytes.len() as u64;
                    let elapsed = started.elapsed().as_secs_f64().max(0.1);
                    let speed_mbps = (downloaded as f64 / (1024.0 * 1024.0)) / elapsed;
                    let pct = if total > 0 {
                        (downloaded as f32 / total as f32).clamp(0.0, 1.0)
                    } else {
                        0.0
                    };
                    let mut st = self.download_status.lock().unwrap();
                    st.downloaded_bytes = downloaded;
                    st.total_bytes = total;
                    st.progress = pct;
                    st.speed_mbps = (speed_mbps * 100.0).round() / 100.0;
                }
                Err(e) => {
                    let mut st = self.download_status.lock().unwrap();
                    st.state = UpdateDownloadState::Error;
                    st.error = Some(e.to_string());
                    return;
                }
            }
        }

        let mut st = self.download_status.lock().unwrap();
        st.state = UpdateDownloadState::Downloaded;
        st.progress = 1.0;
        st.file_path = Some(target_path.to_string_lossy().to_string());
    }

    pub fn install_downloaded_update(&self) -> Result<(), String> {
        let path = self
            .download_status
            .lock()
            .unwrap()
            .file_path
            .clone()
            .ok_or_else(|| "File installer belum diunduh".to_string())?;
        open::that(&path).map_err(|e| format!("Gagal meluncurkan installer: {e}"))?;
        std::process::exit(0);
    }
}

fn parse_semver(ver: &str) -> (u32, u32, u32) {
    let clean = ver
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(['-', '+'])
        .next()
        .unwrap_or("");
    let mut parts = clean.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_comparison_and_asset_selection() {
        assert!(parse_semver("v0.9.5") > parse_semver("0.9.4"));
        assert!(parse_semver("1.0.0") > parse_semver("v0.9.9"));
        assert_eq!(parse_semver("v0.9.4-beta"), (0, 9, 4));

        let assets = vec![
            serde_json::json!({
                "name": "RadioBOSSCaster-Portable-Linux-x64.tar.gz",
                "size": 1000,
                "browser_download_url": "https://example.com/linux.tar.gz"
            }),
            serde_json::json!({
                "name": "RadioBOSSCaster-Setup-x64.exe",
                "size": 2000,
                "browser_download_url": "https://example.com/setup.exe"
            }),
        ];
        let picked = UpdateService::select_asset(Some(&assets)).unwrap();
        if cfg!(target_os = "windows") {
            assert_eq!(picked.name, "RadioBOSSCaster-Setup-x64.exe");
        } else {
            assert_eq!(picked.name, "RadioBOSSCaster-Portable-Linux-x64.tar.gz");
        }
    }
}
