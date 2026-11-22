use std::fs;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::time::Duration;

use once_cell::sync::Lazy;
use quick_xml::events::Event;
use quick_xml::Reader;
use regex::Regex;
use reqwest::Client;

use crate::models::config::AppConfig;
use crate::models::radioboss::{NowPlayingTrack, PlaylistItem, RadioBossStatus, TabsResponse};

static RE_PRF_TABS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)PlaylistTabs\s*=\s*<(.*?)\r?\n\s*LastPlaylistTabIndex\s*=\s*(\d+)").unwrap()
});
static RE_PRF_CAPTION: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"Caption\s*=\s*'([^']+)'").unwrap());
static RE_API_FILE_IDX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)FILE="[^"]*_(\d+)\.m3u""#).unwrap());

/// Async client for RadioBOSS Web Remote Control HTTP API.
#[derive(Clone)]
pub struct RadioBossService {
    client: Client,
}

impl Default for RadioBossService {
    fn default() -> Self {
        Self::new()
    }
}

impl RadioBossService {
    pub fn new() -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(5)
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    pub fn build_base_url(cfg: &AppConfig) -> String {
        let mut host = cfg.radioboss_host.trim().to_string();
        if host.is_empty() {
            host = "http://127.0.0.1".to_string();
        }
        if !host.starts_with("http://") && !host.starts_with("https://") {
            host = format!("http://{host}");
        }
        host = host.trim_end_matches('/').to_string();
        // Avoid duplicating port if user typed host:port
        let without_scheme = host
            .trim_start_matches("http://")
            .trim_start_matches("https://");
        if without_scheme.contains(':') {
            host
        } else {
            format!("{host}:{}", cfg.radioboss_port)
        }
    }

    pub fn is_local_instance(cfg: &AppConfig) -> bool {
        let clean = cfg
            .radioboss_host
            .trim()
            .to_lowercase()
            .replace("http://", "")
            .replace("https://", "");
        let host_only = clean.split('/').next().unwrap_or("").split(':').next().unwrap_or("");
        matches!(host_only, "127.0.0.1" | "localhost" | "::1" | "0.0.0.0" | "")
    }

    /// Returns the URL RadioBOSS can reach on local loopback or studio LAN.
    pub fn get_reachable_stream_url(&self, cfg: &AppConfig, clean_id: &str) -> String {
        let port = if cfg.server_port == 0 { 8000 } else { cfg.server_port };
        if Self::is_local_instance(cfg) {
            return format!("http://127.0.0.1:{port}/api/stream/{clean_id}.mp3");
        }
        let lan_ip = Self::get_outbound_ip(cfg);
        format!("http://{lan_ip}:{port}/api/stream/{clean_id}.mp3")
    }

    fn get_outbound_ip(cfg: &AppConfig) -> String {
        let clean = cfg
            .radioboss_host
            .trim()
            .replace("http://", "")
            .replace("https://", "");
        let clean_host = clean.split('/').next().unwrap_or("").split(':').next().unwrap_or("127.0.0.1");
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            if sock.connect((clean_host, cfg.radioboss_port.max(80))).is_ok() {
                if let Ok(addr) = sock.local_addr() {
                    return addr.ip().to_string();
                }
            }
        }
        "127.0.0.1".to_string()
    }

    pub async fn check_status(&self, cfg: &AppConfig) -> RadioBossStatus {
        let base_url = Self::build_base_url(cfg);
        let mut params = vec![("action", "playbackinfo")];
        if !cfg.radioboss_password.is_empty() {
            params.push(("pass", cfg.radioboss_password.as_str()));
        }

        let resp = match self.client.get(&base_url).query(&params).timeout(Duration::from_secs(6)).send().await {
            Ok(r) => r,
            Err(e) => {
                return RadioBossStatus {
                    connected: false,
                    now_playing: None,
                    error: Some(format!(
                        "Tidak dapat terhubung ke RadioBOSS di {base_url} ({e}). Pastikan Web Remote Control aktif."
                    )),
                };
            }
        };

        if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
            return RadioBossStatus {
                connected: false,
                now_playing: None,
                error: Some("Autentikasi gagal: Password RadioBOSS salah.".to_string()),
            };
        }
        if !resp.status().is_success() {
            return RadioBossStatus {
                connected: false,
                now_playing: None,
                error: Some(format!("RadioBOSS HTTP error: status {}", resp.status())),
            };
        }

        let raw = resp.text().await.unwrap_or_default();
        Self::parse_playback_info(&raw)
    }

    fn parse_playback_info(xml_raw: &str) -> RadioBossStatus {
        let clean = xml_raw.trim().trim_start_matches('\u{feff}').trim();
        if clean.is_empty() {
            return RadioBossStatus {
                connected: false,
                now_playing: None,
                error: Some(
                    "RadioBOSS merespons kosong. Periksa apakah Password RadioBOSS di Pengaturan sudah sesuai."
                        .to_string(),
                ),
            };
        }
        let lower = clean.to_lowercase();
        if lower.contains("invalid password")
            || lower.contains("access denied")
            || lower.starts_with("error 401")
            || lower.starts_with("error 403")
        {
            return RadioBossStatus {
                connected: false,
                now_playing: None,
                error: Some("Password RadioBOSS salah atau akses ditolak. Periksa menu Pengaturan.".to_string()),
            };
        }

        let mut reader = Reader::from_str(clean);
        reader.config_mut().trim_text(true);

        let mut in_current_track = false;
        let mut in_status_tag = false;
        let mut in_error_tag = false;
        let mut status_text = String::new();
        let mut error_text = String::new();

        let mut track_artist = String::new();
        let mut track_title = String::new();
        let mut cast_title = String::new();
        let mut item_title = String::new();
        let mut filename = String::new();
        let mut duration_str = "00:00".to_string();
        let mut pos_str = "00:00".to_string();
        let mut playback_state = "stopped".to_string();
        let mut listeners: Option<u32> = None;

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let name = e.name().as_ref().to_uppercase();
                    if name == "CURRENTTRACK" {
                        in_current_track = true;
                    } else if name == "STATUS" {
                        in_status_tag = true;
                    } else if name == "ERROR" {
                        in_error_tag = true;
                    } else if name == "TRACK" && in_current_track {
                        for attr in e.attributes().flatten() {
                            let k = attr.key.as_ref().to_uppercase();
                            let v = attr.normalized_value(quick_xml::XmlVersion::Implicit1_0).unwrap_or_default().trim().to_string();
                            match k.as_str() {
                                "ARTIST" => track_artist = v,
                                "TITLE" => track_title = v,
                                "CASTTITLE" => cast_title = v,
                                "ITEMTITLE" => item_title = v,
                                "FILENAME" => filename = v,
                                "DURATION" => duration_str = format_time_string(&v),
                                _ => {}
                            }
                        }
                    } else if name == "PLAYBACK" {
                        for attr in e.attributes().flatten() {
                            let k = attr.key.as_ref().to_uppercase();
                            let v = attr.normalized_value(quick_xml::XmlVersion::Implicit1_0).unwrap_or_default().trim().to_string();
                            match k.as_str() {
                                "STATE" => playback_state = v.to_lowercase(),
                                "POS" => pos_str = format_ms_string(&v),
                                "LEN" if duration_str == "00:00" => {
                                    duration_str = format_ms_string(&v);
                                }
                                _ => {}
                            }
                        }
                    } else if name == "LISTENERS" {
                        for attr in e.attributes().flatten() {
                            let k = attr.key.as_ref().to_uppercase();
                            if k == "COUNT" {
                                if let Ok(n) = attr.normalized_value(quick_xml::XmlVersion::Implicit1_0).unwrap_or_default().trim().parse::<u32>() {
                                    listeners = Some(n);
                                }
                            }
                        }
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name = e.name().as_ref().to_uppercase();
                    if name == "CURRENTTRACK" {
                        in_current_track = false;
                    } else if name == "STATUS" {
                        in_status_tag = false;
                    } else if name == "ERROR" {
                        in_error_tag = false;
                    }
                }
                Ok(Event::Text(e)) => {
                    let t = e.xml10_content().trim().to_string();
                    if in_status_tag {
                        status_text = t;
                    } else if in_error_tag {
                        error_text = t;
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    return RadioBossStatus {
                        connected: false,
                        now_playing: None,
                        error: Some(format!("Format XML RadioBOSS tidak valid: {e}")),
                    };
                }
                _ => {}
            }
            buf.clear();
        }

        if playback_state == "stopped" {
            pos_str = "00:00".to_string();
        }

        if status_text.eq_ignore_ascii_case("error") {
            return RadioBossStatus {
                connected: false,
                now_playing: None,
                error: Some(format!(
                    "RadioBOSS error: {}",
                    if error_text.is_empty() { "Unknown" } else { &error_text }
                )),
            };
        }

        let mut resolved = if !track_artist.is_empty() && !track_title.is_empty() {
            format!("{track_artist} - {track_title}")
        } else if !cast_title.is_empty()
            && !cast_title.starts_with("http://")
            && !cast_title.starts_with("https://")
            && !cast_title.eq_ignore_ascii_case("network stream")
        {
            cast_title
        } else if !item_title.is_empty()
            && !item_title.starts_with("http://")
            && !item_title.starts_with("https://")
            && !item_title.eq_ignore_ascii_case("network stream")
        {
            item_title
        } else {
            track_title
        };

        if resolved.is_empty()
            || resolved.starts_with("http://")
            || resolved.starts_with("https://")
            || resolved.eq_ignore_ascii_case("network stream")
        {
            if let Some(stem) = std::path::Path::new(&filename).file_stem() {
                let s = stem.to_string_lossy().to_string();
                if !s.is_empty() && !s.starts_with("http") {
                    resolved = s;
                }
            }
        }

        if resolved.is_empty() || resolved.starts_with("http://") || resolved.starts_with("https://") {
            resolved = if playback_state == "playing" {
                "Siaran CastDeck Aktif".to_string()
            } else {
                "Tidak ada lagu yang sedang diputar".to_string()
            };
        }

        RadioBossStatus {
            connected: true,
            now_playing: Some(NowPlayingTrack {
                title: resolved,
                duration: Some(duration_str),
                position: Some(pos_str),
                status: playback_state,
                listeners,
            }),
            error: None,
        }
    }

    pub async fn insert_track(
        &self,
        cfg: &AppConfig,
        filename: &str,
        pos: i32,
        title: Option<&str>,
    ) -> Result<String, String> {
        let base_url = Self::build_base_url(cfg);
        let positions: Vec<i32> = if pos == -2 { vec![-2, 1, -1] } else { vec![pos] };
        let mut last_error = String::new();

        for attempt_pos in positions {
            for param_key in ["action", "cmd"] {
                let pos_str = attempt_pos.to_string();
                let mut params: Vec<(&str, &str)> = vec![
                    (param_key, "inserttrack"),
                    ("filename", filename),
                    ("pos", &pos_str),
                ];
                if let Some(t) = title {
                    if !t.is_empty() {
                        params.push(("streamingtitle", t));
                    }
                }
                if !cfg.radioboss_password.is_empty() {
                    params.push(("pass", &cfg.radioboss_password));
                }

                match self
                    .client
                    .get(&base_url)
                    .query(&params)
                    .timeout(Duration::from_secs(10))
                    .send()
                    .await
                {
                    Ok(resp) => {
                        if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
                            return Err("Autentikasi gagal: Password RadioBOSS salah.".to_string());
                        }
                        if !resp.status().is_success() {
                            last_error = format!("RadioBOSS HTTP error {}", resp.status());
                            continue;
                        }
                        let text = resp
                            .text()
                            .await
                            .unwrap_or_default()
                            .trim()
                            .trim_start_matches('\u{feff}')
                            .trim()
                            .to_string();
                        if text.is_empty() {
                            last_error =
                                "RadioBOSS merespons kosong (kemungkinan password salah).".to_string();
                            continue;
                        }
                        let lower = text.to_lowercase();
                        if lower.starts_with("error")
                            || lower.contains("invalid password")
                            || lower.contains("access denied")
                        {
                            last_error = text;
                            continue;
                        }
                        return Ok("Lagu berhasil dikirim ke antrean RadioBOSS".to_string());
                    }
                    Err(e) => {
                        return Err(format!("Gagal terhubung ke RadioBOSS: {e}"));
                    }
                }
            }
        }

        Err(format!(
            "RadioBOSS menolak antrean: {}",
            if last_error.is_empty() {
                "Tidak ada respon"
            } else {
                &last_error
            }
        ))
    }

    pub async fn send_playback_command(&self, cfg: &AppConfig, cmd: &str) -> Result<String, String> {
        let base_url = Self::build_base_url(cfg);
        let mut params = vec![("cmd", cmd)];
        if !cfg.radioboss_password.is_empty() {
            params.push(("pass", &cfg.radioboss_password));
        }

        let resp = self
            .client
            .get(&base_url)
            .query(&params)
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi RadioBOSS: {e}"))?;

        if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
            return Err("Autentikasi RadioBOSS gagal.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!("RadioBOSS HTTP error {}", resp.status()));
        }

        let label = match cmd {
            "play" => "Playback RadioBOSS dimulai",
            "pause" => "Playback RadioBOSS dijeda",
            "stop" => "Playback RadioBOSS dihentikan",
            "next" => "Lagu berhasil dilewati (skip)",
            _ => "Perintah dijalankan",
        };
        Ok(label.to_string())
    }

    pub async fn set_cast_title(&self, cfg: &AppConfig, title: &str) -> Result<String, String> {
        let clean = title.trim();
        if clean.is_empty() {
            return Err("Judul siaran tidak boleh kosong.".to_string());
        }
        let base_url = Self::build_base_url(cfg);
        let cmd_val = format!("setcasttitle {clean}");
        let mut params = vec![("cmd", cmd_val.as_str())];
        if !cfg.radioboss_password.is_empty() {
            params.push(("pass", &cfg.radioboss_password));
        }

        let resp = self
            .client
            .get(&base_url)
            .query(&params)
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi RadioBOSS: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("RadioBOSS HTTP error {}", resp.status()));
        }
        Ok(format!("Judul siaran diubah ke: '{clean}'"))
    }

    pub async fn switch_playlist_tab(&self, cfg: &AppConfig, tab_name: &str) -> Result<String, String> {
        let clean = tab_name.trim();
        if clean.is_empty() {
            return Ok("Tab aktif saat ini digunakan".to_string());
        }
        let base_url = Self::build_base_url(cfg);
        let cmd_val = format!("playlist {clean}");
        let mut params = vec![("cmd", cmd_val.as_str())];
        if !cfg.radioboss_password.is_empty() {
            params.push(("pass", &cfg.radioboss_password));
        }

        let resp = self
            .client
            .get(&base_url)
            .query(&params)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi RadioBOSS: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("RadioBOSS HTTP error {}", resp.status()));
        }
        let txt = resp.text().await.unwrap_or_default();
        if txt.trim().to_lowercase().starts_with("error") {
            return Err(format!("RadioBOSS Error: {}", txt.trim()));
        }
        tokio::time::sleep(Duration::from_millis(80)).await;
        Ok(format!("Tab RadioBOSS dialihkan ke '{clean}'"))
    }

    /// Auto-discovers playlist tabs 1:1 from local RadioBOSS `.prf` profile + live `getplaylist2`.
    pub async fn get_tabs_info(&self, cfg: &AppConfig) -> TabsResponse {
        let mut discovered_tabs: Vec<String> = Vec::new();
        let mut active_idx: usize = 0;
        let mut is_synced = false;

        if let Some(appdata) = std::env::var_os("APPDATA") {
            let djsoft = PathBuf::from(appdata).join("djsoft.net");
            if djsoft.is_dir() {
                if let Ok(entries) = fs::read_dir(&djsoft) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if !name.starts_with("RadioBOSS_") {
                            continue;
                        }
                        let profile_dir = entry.path().join("Profile");
                        if !profile_dir.is_dir() {
                            continue;
                        }
                        let mut prf_path: Option<PathBuf> = None;
                        let last_ini = profile_dir.join("lastprofile.ini");
                        if last_ini.is_file() {
                            if let Ok(raw) = fs::read_to_string(&last_ini) {
                                for line in raw.lines() {
                                    if let Some(rest) = line.strip_prefix("LastProfileName=") {
                                        let cand = profile_dir.join(rest.trim());
                                        if cand.is_file() {
                                            prf_path = Some(cand);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if prf_path.is_none() {
                            if let Ok(p_entries) = fs::read_dir(&profile_dir) {
                                let mut prfs: Vec<(PathBuf, std::time::SystemTime)> = p_entries
                                    .flatten()
                                    .filter(|pe| {
                                        pe.path().extension().and_then(|s| s.to_str()) == Some("prf")
                                    })
                                    .map(|pe| {
                                        let mtime = pe
                                            .metadata()
                                            .and_then(|m| m.modified())
                                            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                                        (pe.path(), mtime)
                                    })
                                    .collect();
                                prfs.sort_by_key(|item| std::cmp::Reverse(item.1));
                                prf_path = prfs.into_iter().next().map(|x| x.0);
                            }
                        }
                        if let Some(prf) = prf_path {
                            if let Ok(content) = fs::read_to_string(&prf) {
                                if let Some(caps) = RE_PRF_TABS.captures(&content) {
                                    let block = &caps[1];
                                    if let Ok(idx) = caps[2].parse::<usize>() {
                                        active_idx = idx;
                                    }
                                    for cap in RE_PRF_CAPTION.captures_iter(block) {
                                        let tab_name = cap[1].trim().to_string();
                                        if !tab_name.is_empty() && !discovered_tabs.contains(&tab_name) {
                                            discovered_tabs.push(tab_name);
                                        }
                                    }
                                    if !discovered_tabs.is_empty() {
                                        is_synced = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Check live active tab index from RadioBOSS API `getplaylist2`
        let base_url = Self::build_base_url(cfg);
        let mut params = vec![("action", "getplaylist2"), ("cnt", "0")];
        if !cfg.radioboss_password.is_empty() {
            params.push(("pass", &cfg.radioboss_password));
        }
        if let Ok(r) = self.client.get(&base_url).query(&params).timeout(Duration::from_secs(3)).send().await {
            if r.status().is_success() {
                let text = r.text().await.unwrap_or_default();
                if let Some(caps) = RE_API_FILE_IDX.captures(&text) {
                    if let Ok(idx) = caps[1].parse::<usize>() {
                        active_idx = idx;
                    }
                }
            }
        }

        if discovered_tabs.is_empty() {
            for stab in &cfg.available_playlist_tabs {
                if !stab.is_empty() && !discovered_tabs.contains(stab) {
                    discovered_tabs.push(stab.clone());
                }
            }
        }
        if discovered_tabs.is_empty() {
            discovered_tabs.push("Playlist 1".to_string());
        }

        let active_tab = discovered_tabs
            .get(active_idx)
            .cloned()
            .unwrap_or_else(|| discovered_tabs[0].clone());

        TabsResponse {
            success: true,
            active_tab,
            active_index: active_idx as i32,
            available_tabs: discovered_tabs,
            is_synced,
        }
    }

    pub async fn get_playlist(&self, cfg: &AppConfig, limit: usize) -> Result<Vec<PlaylistItem>, String> {
        let base_url = Self::build_base_url(cfg);

        for action_name in ["getplaylist2", "getplaylist"] {
            let mut params = vec![("action", action_name)];
            if action_name == "getplaylist2" {
                params.push(("cnt", "0"));
            }
            if !cfg.radioboss_password.is_empty() {
                params.push(("pass", &cfg.radioboss_password));
            }

            let resp = match self
                .client
                .get(&base_url)
                .query(&params)
                .timeout(Duration::from_secs(6))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => return Err(format!("Tidak dapat terhubung ke RadioBOSS: {e}")),
            };

            if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
                return Err("Autentikasi gagal: Password RadioBOSS salah.".to_string());
            }
            if !resp.status().is_success() {
                continue;
            }

            let raw = resp.text().await.unwrap_or_default();
            let clean = raw.trim().trim_start_matches('\u{feff}').trim();
            if !clean.starts_with('<') {
                continue;
            }

            let tracks = Self::parse_playlist_xml(clean, limit);
            if !tracks.is_empty() {
                return Ok(tracks);
            }
        }

        Ok(Vec::new())
    }

    fn parse_playlist_xml(xml: &str, limit: usize) -> Vec<PlaylistItem> {
        let mut reader = Reader::from_str(xml);
        let mut tracks = Vec::new();
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let tag = e.name().as_ref().to_uppercase();
                    if tag == "TRACK" {
                        let mut item_type = String::new();
                        let mut artist = String::new();
                        let mut title = String::new();
                        let mut cast_title = String::new();
                        let mut filename = String::new();
                        let mut duration = "00:00".to_string();
                        let mut start_time = String::new();
                        let mut index = tracks.len() + 1;

                        for attr in e.attributes().flatten() {
                            let k = attr.key.as_ref().to_uppercase();
                            let v = attr.normalized_value(quick_xml::XmlVersion::Implicit1_0).unwrap_or_default().trim().to_string();
                            match k.as_str() {
                                "ITEMTYPE" => item_type = v.to_uppercase(),
                                "ARTIST" => artist = v,
                                "TITLE" => title = v,
                                "CASTTITLE" => cast_title = v,
                                "FILENAME" => filename = v,
                                "DURATION" => {
                                    duration = if v == "––:––" || v.is_empty() {
                                        "00:00".to_string()
                                    } else {
                                        v
                                    };
                                }
                                "STARTTIME" => start_time = v,
                                "INDEX" => {
                                    if let Ok(i) = v.parse::<usize>() {
                                        index = i;
                                    }
                                }
                                _ => {}
                            }
                        }

                        if item_type == "TRACK_PLAYED" {
                            buf.clear();
                            continue;
                        }

                        let display_title = if !artist.is_empty() && !title.is_empty() {
                            format!("{artist} - {title}")
                        } else if !cast_title.is_empty()
                            && !cast_title.starts_with("http://")
                            && !cast_title.starts_with("https://")
                        {
                            cast_title
                        } else if !filename.is_empty() {
                            let stem = std::path::Path::new(&filename)
                                .file_stem()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_default();
                            if !stem.is_empty() && !stem.starts_with("http") {
                                stem
                            } else if !title.is_empty() {
                                title.clone()
                            } else {
                                "Audio Stream".to_string()
                            }
                        } else if !title.is_empty() {
                            title.clone()
                        } else {
                            "Lagu RadioBOSS".to_string()
                        };

                        let is_playing = item_type == "TRACK_PLAYING";
                        tracks.push(PlaylistItem {
                            index,
                            artist,
                            title,
                            display_title,
                            duration,
                            start_time,
                            filename,
                            is_playing,
                        });

                        if tracks.len() >= limit {
                            break;
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
        tracks
    }
}

pub fn format_ms_string(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() || s == "––:––" || s == "--:--" || s == "0" || s == "-1" {
        return "00:00".to_string();
    }
    if s.contains(':') {
        return s.to_string();
    }
    if let Ok(val) = s.parse::<f64>() {
        let secs = (val as i64) / 1000;
        if secs <= 0 {
            return "00:00".to_string();
        }
        let h = secs / 3600;
        let m = (secs % 3600) / 60;
        let sec = seconds_mod(secs);
        if h > 0 {
            format!("{h:02}:{m:02}:{sec:02}")
        } else {
            format!("{m:02}:{sec:02}")
        }
    } else {
        "00:00".to_string()
    }
}

pub fn format_time_string(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() || s == "––:––" || s == "--:--" || s == "0" || s == "-1" {
        return "00:00".to_string();
    }
    if s.contains(':') {
        return s.to_string();
    }
    if let Ok(val) = s.parse::<f64>() {
        let int_val = val as i64;
        if int_val <= 0 {
            return "00:00".to_string();
        }
        let secs = if int_val > 10000 {
            int_val / 1000
        } else {
            int_val
        };
        let h = secs / 3600;
        let m = (secs % 3600) / 60;
        let sec = seconds_mod(secs);
        if h > 0 {
            format!("{h:02}:{m:02}:{sec:02}")
        } else {
            format!("{m:02}:{sec:02}")
        }
    } else {
        "00:00".to_string()
    }
}

fn seconds_mod(secs: i64) -> i64 {
    secs % 60
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_playback_info_with_bom_and_len_fallback() {
        let xml = "\u{feff}<Info><CurrentTrack><TRACK ARTIST=\"Tulus\" TITLE=\"Hati-Hati di Jalan\" DURATION=\"00:00\"/></CurrentTrack><Playback state=\"playing\" pos=\"45000\" len=\"242000\"/><Listeners count=\"12\"/></Info>";
        let status = RadioBossService::parse_playback_info(xml);
        assert!(status.connected);
        let np = status.now_playing.unwrap();
        assert_eq!(np.title, "Tulus - Hati-Hati di Jalan");
        assert_eq!(np.status, "playing");
        assert_eq!(np.position.as_deref(), Some("00:45"));
        assert_eq!(np.duration.as_deref(), Some("04:02"));
        assert_eq!(np.listeners, Some(12));
    }

    #[test]
    fn test_parse_playlist_xml_excludes_played_and_keeps_playing() {
        let xml = "<Playlist><TRACK INDEX=\"1\" ITEMTYPE=\"TRACK_PLAYED\" ARTIST=\"Old\" TITLE=\"Played\" DURATION=\"03:00\"/><TRACK INDEX=\"2\" ITEMTYPE=\"TRACK_PLAYING\" ARTIST=\"Sheila On 7\" TITLE=\"Dan\" DURATION=\"04:49\"/><TRACK INDEX=\"3\" ARTIST=\"Mahalini\" TITLE=\"Sial\" DURATION=\"04:03\"/></Playlist>";
        let list = RadioBossService::parse_playlist_xml(xml, 50);
        assert_eq!(list.len(), 2);
        assert!(list[0].is_playing);
        assert_eq!(list[0].display_title, "Sheila On 7 - Dan");
        assert!(!list[1].is_playing);
        assert_eq!(list[1].display_title, "Mahalini - Sial");
    }
}
