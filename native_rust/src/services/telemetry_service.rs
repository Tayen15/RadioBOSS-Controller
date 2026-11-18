use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::Timelike;
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::models::casterhub::{
    CasterHubChartTrack, CasterHubCrowdMetadata, CasterHubListenerRequest, CasterHubSessionStats,
};
use crate::models::track::TrackItem;
use crate::models::APP_VERSION;
use crate::services::db_service::DatabaseService;
use crate::services::settings_service::SettingsService;

const DEFAULT_CASTERHUB_URL: &str = "https://rcb.oktaa.my.id";

/// Computes the exact same deterministic Zero-PII station hash as `main` (v0.9.4)
/// so upgraded stations preserve their CasterHub identity and stats seamlessly.
pub fn compute_machine_hash() -> String {
    let mut raw_ident = String::new();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if let Ok(out) = std::process::Command::new("reg")
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .creation_flags(0x08000000)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("MachineGuid") {
                    if let Some(guid) = line.split_whitespace().last() {
                        raw_ident = guid.trim().to_string();
                        break;
                    }
                }
            }
        }
    }

    if raw_ident.is_empty() {
        let host = sysinfo::System::host_name().unwrap_or_else(|_| "studio".to_string());
        let user = std::env::var("USERNAME")
            .or_else(|_| std::env::var("USER"))
            .unwrap_or_else(|_| "caster".to_string());
        raw_ident = format!("{host}-{user}");
    }

    let salted = format!("CasterHub::Salt::2026::{raw_ident}");
    let mut hasher = Sha256::new();
    hasher.update(salted.as_bytes());
    let digest = hasher.finalize();
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

#[derive(Clone)]
pub struct TelemetryService {
    pub station_hash: String,
    db: DatabaseService,
    settings: SettingsService,
    client: Client,
    state: Arc<Mutex<TelemetryInner>>,
}

struct TelemetryInner {
    session_start: Instant,
    last_airtime_sync: Instant,
    session_songs_dispatched: u64,
    session_cache_saved_bytes: u64,
    latest_onair_track: Option<Value>,
}

impl TelemetryService {
    pub fn new(db: DatabaseService, settings: SettingsService) -> Self {
        let now = Instant::now();
        let client = Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            station_hash: compute_machine_hash(),
            db,
            settings,
            client,
            state: Arc::new(Mutex::new(TelemetryInner {
                session_start: now,
                last_airtime_sync: now,
                session_songs_dispatched: 0,
                session_cache_saved_bytes: 0,
                latest_onair_track: None,
            })),
        }
    }

    pub fn set_onair_track(&self, title: &str, artist: &str, video_id: &str) {
        if title.trim().is_empty() {
            return;
        }
        let mut guard = self.state.lock().unwrap();
        guard.latest_onair_track = Some(json!({
            "title": title,
            "artist": artist,
            "video_id": video_id,
        }));
    }

    pub fn clear_onair_track(&self) {
        let mut guard = self.state.lock().unwrap();
        guard.latest_onair_track = None;
    }

    pub fn get_time_belt() -> &'static str {
        let hour = chrono::Local::now().hour();
        if (5..10).contains(&hour) {
            "morning"
        } else if (10..18).contains(&hour) {
            "afternoon"
        } else {
            "night"
        }
    }

    pub fn get_session_stats(&self) -> CasterHubSessionStats {
        let cfg = self.settings.get_config();
        let songs_today = self.db.count_songs_today();
        let guard = self.state.lock().unwrap();
        let session_seconds = guard.session_start.elapsed().as_secs();
        let h = session_seconds / 3600;
        let m = (session_seconds % 3600) / 60;
        let lifetime_hours = ((cfg.total_airtime_seconds as f64 / 3600.0) * 10.0).round() / 10.0;
        let short_hash = &self.station_hash[..self.station_hash.len().min(8)];
        let station_name = if cfg.station_public_name.trim().is_empty() {
            format!("Stasiun #{}", short_hash[..short_hash.len().min(6)].to_uppercase())
        } else {
            cfg.station_public_name.trim().to_string()
        };

        CasterHubSessionStats {
            session_time_formatted: format!("{h:02}j {m:02}m"),
            session_seconds,
            lifetime_airtime_hours: lifetime_hours,
            songs_today,
            session_songs_dispatched: guard.session_songs_dispatched,
            session_cache_saved_mb: ((guard.session_cache_saved_bytes as f64 / (1024.0 * 1024.0))
                * 10.0)
                .round()
                / 10.0,
            station_hash_short: short_hash.to_string(),
            station_name,
            active_stations_online: 1,
            total_airtime_hours: lifetime_hours,
            total_songs_dispatched: guard.session_songs_dispatched,
        }
    }

    pub fn enqueue_airplay_event(
        &self,
        track: &TrackItem,
        clean_title: &str,
        clean_artist: &str,
        action_type: &str,
        is_from_cache: bool,
        file_size_bytes: u64,
    ) {
        {
            let mut guard = self.state.lock().unwrap();
            guard.session_songs_dispatched += 1;
            if is_from_cache && file_size_bytes > 0 {
                guard.session_cache_saved_bytes += file_size_bytes;
            }
            guard.latest_onair_track = Some(json!({
                "title": if clean_title.is_empty() { &track.title } else { clean_title },
                "artist": if clean_artist.is_empty() { track.primary_artist() } else { clean_artist },
                "video_id": &track.video_id,
            }));
        }

        let cfg = self.settings.get_config();
        if !cfg.enable_telemetry {
            return;
        }
        self.db.enqueue_telemetry_outbox(
            track,
            clean_title,
            clean_artist,
            action_type,
            Self::get_time_belt(),
        );
    }

    fn hub_url(&self) -> String {
        let cfg = self.settings.get_config();
        let u = cfg.casterhub_url.trim().trim_end_matches('/');
        if u.is_empty() {
            DEFAULT_CASTERHUB_URL.to_string()
        } else {
            u.to_string()
        }
    }

    pub async fn sync_outbox_to_casterhub(&self) -> bool {
        let mut cfg = self.settings.get_config();
        if !cfg.enable_telemetry {
            return false;
        }

        let (delta_airtime, cache_saved_bytes, latest_onair) = {
            let mut guard = self.state.lock().unwrap();
            let delta = guard.last_airtime_sync.elapsed().as_secs();
            if delta >= 60 {
                guard.last_airtime_sync = Instant::now();
            }
            (delta, guard.session_cache_saved_bytes, guard.latest_onair_track.clone())
        };

        if delta_airtime >= 60 {
            cfg.total_airtime_seconds = cfg.total_airtime_seconds.saturating_add(delta_airtime);
            let _ = self.settings.update_config(cfg.clone());
        }

        let pending = self.db.pop_telemetry_outbox(25);
        let ids: Vec<String> = pending
            .iter()
            .filter_map(|v| v.get("id").and_then(|s| s.as_str()).map(|s| s.to_string()))
            .collect();

        let mut payload = json!({
            "station_hash": self.station_hash,
            "station_name": cfg.station_public_name.trim(),
            "public_stream_url": cfg.public_stream_url.trim(),
            "enable_online_requests": cfg.enable_online_requests,
            "app_version": APP_VERSION,
            "airtime_delta_seconds": delta_airtime,
            "cache_saved_bytes": cache_saved_bytes,
            "events": pending,
        });
        if let Some(onair) = latest_onair {
            payload["now_playing"] = onair;
        }

        let endpoint = format!("{}/api/v1/telemetry/sync", self.hub_url());
        if let Ok(resp) = self.client.post(&endpoint).json(&payload).send().await {
            if resp.status().is_success() {
                self.db.delete_telemetry_outbox_ids(&ids);
                return true;
            }
        }
        false
    }

    pub async fn get_global_charts(&self, category: &str, limit: usize) -> Vec<CasterHubChartTrack> {
        let endpoint = format!(
            "{}/api/v1/charts?category={}&limit={}",
            self.hub_url(),
            urlencoding::encode(category),
            limit
        );
        if let Ok(resp) = self.client.get(&endpoint).send().await {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<Value>().await {
                    if let Some(arr) = val.get("tracks") {
                        if let Ok(parsed) = serde_json::from_value::<Vec<CasterHubChartTrack>>(arr.clone()) {
                            return parsed;
                        }
                    }
                }
            }
        }

        // Local fallback from SQLite DJ Top Chart
        self.db
            .get_dj_top_chart(limit)
            .into_iter()
            .enumerate()
            .map(|(i, c)| CasterHubChartTrack {
                rank: i + 1,
                video_id: c.video_id,
                title: c.title,
                artist: if c.artist.is_empty() {
                    "Unknown Artist".into()
                } else {
                    c.artist
                },
                album: Some(c.album),
                genre: Some(c.genre),
                duration_formatted: Some(c.duration_formatted),
                total_plays: c.play_count,
                unique_stations: 1,
                movement: Some("LOCAL".into()),
            })
            .collect()
    }

    pub async fn get_crowd_clean_metadata(
        &self,
        video_id: &str,
        title: &str,
        artist: &str,
    ) -> Option<CasterHubCrowdMetadata> {
        let cfg = self.settings.get_config();
        if !cfg.enable_crowd_metadata {
            return None;
        }
        if let Some((ct, ca, orig, votes, is_cleaned)) = self.db.get_crowd_metadata(video_id) {
            if is_cleaned {
                return Some(CasterHubCrowdMetadata {
                    clean_title: ct,
                    clean_artist: ca,
                    original_title: orig,
                    votes_count: votes,
                    is_crowd_cleaned: is_cleaned,
                });
            }
        }

        let endpoint = format!(
            "{}/api/v1/metadata/clean?video_id={}&title={}&artist={}",
            self.hub_url(),
            urlencoding::encode(video_id),
            urlencoding::encode(title),
            urlencoding::encode(artist)
        );
        if let Ok(resp) = self.client.get(&endpoint).timeout(Duration::from_secs(3)).send().await {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<Value>().await {
                    if data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                        let clean_title = data
                            .get("clean_title")
                            .and_then(|v| v.as_str())
                            .unwrap_or(title)
                            .to_string();
                        let clean_artist = data
                            .get("clean_artist")
                            .and_then(|v| v.as_str())
                            .unwrap_or(artist)
                            .to_string();
                        let votes = data.get("votes_count").and_then(|v| v.as_u64()).unwrap_or(0);
                        let is_cleaned = data
                            .get("is_crowd_cleaned")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        self.db.save_crowd_metadata(
                            video_id,
                            &clean_title,
                            &clean_artist,
                            title,
                            votes,
                            is_cleaned,
                        );
                        return Some(CasterHubCrowdMetadata {
                            clean_title,
                            clean_artist,
                            original_title: title.to_string(),
                            votes_count: votes,
                            is_crowd_cleaned: is_cleaned,
                        });
                    }
                }
            }
        }
        None
    }

    pub async fn get_station_listener_requests(&self, status: &str) -> Vec<CasterHubListenerRequest> {
        let cfg = self.settings.get_config();
        if !cfg.enable_online_requests {
            return Vec::new();
        }
        let endpoint = format!(
            "{}/api/v1/requests/station?station_hash={}&status={}",
            self.hub_url(),
            self.station_hash,
            urlencoding::encode(status)
        );
        if let Ok(resp) = self.client.get(&endpoint).send().await {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<Value>().await {
                    if let Some(arr) = val.get("requests") {
                        if let Ok(items) = serde_json::from_value::<Vec<CasterHubListenerRequest>>(arr.clone()) {
                            return items;
                        }
                    }
                }
            }
        }
        Vec::new()
    }

    pub async fn action_listener_request(&self, request_id: &str, action: &str) -> bool {
        let endpoint = format!("{}/api/v1/requests/action", self.hub_url());
        let body = json!({
            "station_hash": self.station_hash,
            "request_id": request_id,
            "action": action,
        });
        matches!(
            self.client.post(&endpoint).json(&body).send().await,
            Ok(r) if r.status().is_success()
        )
    }

    pub async fn fetch_network_pulse_summary(&self) -> Option<(u64, f64, u64)> {
        let endpoint = format!("{}/api/v1/network-stats", self.hub_url());
        let resp = self
            .client
            .get(&endpoint)
            .timeout(Duration::from_secs(3))
            .send()
            .await
            .ok()?;
        let val = resp.json::<Value>().await.ok()?;
        let stats = val.get("stats")?;
        Some((
            stats.get("active_stations_online").and_then(|v| v.as_u64()).unwrap_or(0),
            stats.get("total_airtime_hours").and_then(|v| v.as_f64()).unwrap_or(0.0),
            stats.get("total_songs_dispatched").and_then(|v| v.as_u64()).unwrap_or(0),
        ))
    }
}
