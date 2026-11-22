use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::process::Command;

use crate::models::track::TrackItem;
use crate::services::ytmusic_service::format_seconds;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone)]
pub struct CachedMeta {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub year: String,
    pub genre: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Clone)]
pub struct YtDlpService {
    url_cache: Arc<Mutex<HashMap<String, (String, Instant)>>>,
    meta_cache: Arc<Mutex<HashMap<String, CachedMeta>>>,
}

impl Default for YtDlpService {
    fn default() -> Self {
        Self::new()
    }
}

impl YtDlpService {
    pub fn new() -> Self {
        Self {
            url_cache: Arc::new(Mutex::new(HashMap::new())),
            meta_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn find_ytdlp_binary() -> String {
        let bin_name = if cfg!(target_os = "windows") {
            "yt-dlp.exe"
        } else {
            "yt-dlp"
        };

        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                candidates.push(dir.join(bin_name));
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join(bin_name));
            candidates.push(cwd.join("dist").join(bin_name));
            candidates.push(cwd.join("backend").join(".venv").join("Scripts").join(bin_name));
            if let Some(parent) = cwd.parent() {
                candidates.push(parent.join("dist").join(bin_name));
                candidates.push(parent.join("backend").join(".venv").join("Scripts").join(bin_name));
            }
        }

        for c in candidates {
            if c.is_file() {
                return c.to_string_lossy().to_string();
            }
        }
        bin_name.to_string()
    }

    fn find_optional_cookiefile() -> Option<String> {
        let mut candidates = Vec::new();
        if let Some(appdata) = std::env::var_os("APPDATA") {
            candidates.push(PathBuf::from(appdata).join("RadioBOSSCaster").join("cookies.txt"));
        }
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("data").join("cookies.txt"));
            candidates.push(cwd.join("cookies.txt"));
        }
        for c in candidates {
            if c.is_file() && std::fs::metadata(&c).map(|m| m.len() > 32).unwrap_or(false) {
                return Some(c.to_string_lossy().to_string());
            }
        }
        None
    }

    pub fn sanitize_youtube_url(url_or_id: &str) -> String {
        let s = url_or_id.trim();
        if s.starts_with("http://") || s.starts_with("https://") {
            s.to_string()
        } else {
            format!("https://www.youtube.com/watch?v={s}")
        }
    }

    pub fn get_cached_meta(&self, video_id: &str) -> CachedMeta {
        let clean_id = video_id.trim().trim_end_matches(".mp3");
        self.meta_cache
            .lock()
            .unwrap()
            .get(clean_id)
            .cloned()
            .unwrap_or(CachedMeta {
                title: "YouTube Audio".to_string(),
                artist: "CastDeck".to_string(),
                album: "Studio Stream".to_string(),
                year: String::new(),
                genre: "Pop".to_string(),
                thumbnail_url: None,
            })
    }

    pub fn store_track_meta(&self, track: &TrackItem) {
        let clean_id = track.video_id.trim().trim_end_matches(".mp3").to_string();
        let mut guard = self.meta_cache.lock().unwrap();
        guard.insert(
            clean_id,
            CachedMeta {
                title: track.title.clone(),
                artist: track.artists_joined(),
                album: track.album.clone().unwrap_or_default(),
                year: track.year.clone().unwrap_or_default(),
                genre: track.genre.clone().unwrap_or_else(|| "Pop".into()),
                thumbnail_url: track.thumbnail_url.clone(),
            },
        );
        if guard.len() > 80 {
            if let Some(first_k) = guard.keys().next().cloned() {
                guard.remove(&first_k);
            }
        }
    }

    /// Resolves direct audio stream URL with TTL cache + multi-client fallback.
    pub async fn get_live_stream_url(&self, video_id: &str) -> Option<String> {
        let clean_id = video_id.trim().trim_end_matches(".mp3");
        {
            let guard = self.url_cache.lock().unwrap();
            if let Some((url, expires)) = guard.get(clean_id) {
                if Instant::now() < *expires {
                    return Some(url.clone());
                }
            }
        }

        let (_, stream_url) = self.extract_track_info(clean_id).await?;
        Some(stream_url)
    }

    /// Runs yt-dlp `--dump-single-json` with multi-client strategies to resolve metadata and stream URL.
    pub async fn extract_track_info(&self, url_or_id: &str) -> Option<(TrackItem, String)> {
        let target_url = Self::sanitize_youtube_url(url_or_id);
        let ytdlp = Self::find_ytdlp_binary();
        let cookie = Self::find_optional_cookiefile();

        let strategies: Vec<Option<&str>> = vec![
            None,
            Some("youtube:player_client=android_vr,visionos,default"),
            Some("youtube:player_client=web_safari,ios,mweb"),
        ];

        for extractor_args in strategies {
            let mut cmd = Command::new(&ytdlp);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);

            cmd.args([
                "-f",
                "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best",
                "--dump-single-json",
                "--no-warnings",
                "--no-playlist",
                "--no-check-certificates",
            ]);
            if let Some(ref cpath) = cookie {
                cmd.args(["--cookies", cpath]);
            }
            if let Some(args) = extractor_args {
                cmd.args(["--extractor-args", args]);
            }
            cmd.arg(&target_url);
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

            if let Ok(Ok(output)) = tokio::time::timeout(Duration::from_secs(25), cmd.output()).await {
                if output.status.success() {
                    if let Ok(mut json) = serde_json::from_slice::<Value>(&output.stdout) {
                        if let Some(first_entry) = json
                            .get("entries")
                            .and_then(|e| e.as_array())
                            .and_then(|arr| arr.first())
                            .cloned()
                        {
                            json = first_entry;
                        }
                        if let Some((track, stream_url)) = Self::parse_ytdlp_json(&json, url_or_id) {
                            self.store_track_meta(&track);
                            self.url_cache.lock().unwrap().insert(
                                track.video_id.clone(),
                                (stream_url.clone(), Instant::now() + Duration::from_secs(1800)),
                            );
                            return Some((track, stream_url));
                        }
                    }
                }
            }
        }
        None
    }

    fn parse_ytdlp_json(info: &Value, fallback_id: &str) -> Option<(TrackItem, String)> {
        let video_id = info
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or(fallback_id)
            .to_string();

        let mut stream_url = info
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if stream_url.is_none() {
            if let Some(formats) = info.get("formats").and_then(|v| v.as_array()) {
                for f in formats.iter().rev() {
                    let acodec = f.get("acodec").and_then(|v| v.as_str()).unwrap_or("none");
                    let vcodec = f.get("vcodec").and_then(|v| v.as_str()).unwrap_or("none");
                    let proto = f.get("protocol").and_then(|v| v.as_str()).unwrap_or("");
                    if acodec != "none" && vcodec == "none" && proto.starts_with("http") {
                        if let Some(u) = f.get("url").and_then(|v| v.as_str()) {
                            stream_url = Some(u.to_string());
                            break;
                        }
                    }
                }
                if stream_url.is_none() {
                    for f in formats.iter().rev() {
                        let acodec = f.get("acodec").and_then(|v| v.as_str()).unwrap_or("none");
                        if acodec != "none" {
                            if let Some(u) = f.get("url").and_then(|v| v.as_str()) {
                                stream_url = Some(u.to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }

        let resolved_url = stream_url?;
        let title = info
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Title")
            .to_string();
        let artist = info
            .get("artist")
            .or_else(|| info.get("uploader"))
            .or_else(|| info.get("channel"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();
        let album = info
            .get("album")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let duration_seconds = info
            .get("duration")
            .and_then(|v| v.as_f64())
            .map(|d| d as u64)
            .unwrap_or(0);
        let thumbnail_url = info
            .get("thumbnail")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let year = info
            .get("release_year")
            .and_then(|v| v.as_u64())
            .map(|y| y.to_string())
            .or_else(|| {
                info.get("release_date")
                    .or_else(|| info.get("upload_date"))
                    .and_then(|v| v.as_str())
                    .and_then(|d| d.get(..4))
                    .map(|y| y.to_string())
            });

        let genre = info
            .get("genre")
            .and_then(|v| v.as_str())
            .or_else(|| {
                info.get("tags")
                    .and_then(|t| t.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_str())
            })
            .unwrap_or("Pop")
            .to_string();

        let track = TrackItem {
            video_id: video_id.clone(),
            title,
            artists: vec![artist],
            album,
            duration_seconds: Some(duration_seconds),
            duration_formatted: Some(format_seconds(duration_seconds)),
            thumbnail_url,
            url: format!("https://music.youtube.com/watch?v={video_id}"),
            year,
            genre: Some(genre),
        };
        Some((track, resolved_url))
    }

    /// Fallback chunked audio download via yt-dlp when direct FFmpeg stream fails.
    pub async fn download_audio_raw(&self, video_id: &str, temp_dir: &Path) -> Option<PathBuf> {
        let clean_id = video_id.trim().trim_end_matches(".mp3");
        let ytdlp = Self::find_ytdlp_binary();
        let out_tmpl = temp_dir.join(format!("_raw_{clean_id}.%(ext)s"));
        let target_url = Self::sanitize_youtube_url(clean_id);

        let mut cmd = Command::new(&ytdlp);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.args([
            "-f",
            "bestaudio[ext=m4a]/bestaudio/best",
            "-o",
            &out_tmpl.to_string_lossy(),
            "--no-warnings",
            "--no-playlist",
            "--no-check-certificates",
            &target_url,
        ]);

        if let Ok(Ok(status)) = tokio::time::timeout(Duration::from_secs(45), cmd.status()).await {
            if status.success() {
                if let Ok(entries) = std::fs::read_dir(temp_dir) {
                    let prefix = format!("_raw_{clean_id}.");
                    for e in entries.flatten() {
                        let fname = e.file_name().to_string_lossy().to_string();
                        if fname.starts_with(&prefix) && !fname.ends_with(".part") {
                            return Some(e.path());
                        }
                    }
                }
            }
        }
        None
    }

    /// Bulk resolves a YouTube or YouTube Music playlist URL into a list of tracks.
    pub async fn extract_playlist(&self, playlist_url: &str) -> Result<(String, Vec<TrackItem>), String> {
        let ytdlp = Self::find_ytdlp_binary();
        let mut cmd = Command::new(&ytdlp);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.args([
            "--flat-playlist",
            "--dump-single-json",
            "--no-warnings",
            "--no-check-certificates",
            playlist_url.trim(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

        let output = tokio::time::timeout(Duration::from_secs(30), cmd.output())
            .await
            .map_err(|_| "Timeout mengekstrak playlist YouTube.".to_string())?
            .map_err(|e| format!("Gagal menjalankan yt-dlp: {e}"))?;

        if !output.status.success() {
            return Err("Gagal membaca playlist YouTube. Pastikan URL playlist publik dan valid.".to_string());
        }

        let json: Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Format JSON playlist tidak valid: {e}"))?;

        let playlist_title = json
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Imported Playlist")
            .to_string();

        let mut tracks = Vec::new();
        if let Some(entries) = json.get("entries").and_then(|e| e.as_array()) {
            for item in entries {
                let Some(vid) = item.get("id").and_then(|v| v.as_str()) else {
                    continue;
                };
                if vid.is_empty() {
                    continue;
                }
                let title = item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Title")
                    .to_string();
                if title == "[Deleted video]" || title == "[Private video]" {
                    continue;
                }
                let artist = item
                    .get("uploader")
                    .or_else(|| item.get("channel"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("YouTube Music")
                    .to_string();
                let dur = item
                    .get("duration")
                    .and_then(|v| v.as_f64())
                    .map(|d| d as u64)
                    .unwrap_or(0);
                let thumb = item
                    .get("thumbnails")
                    .and_then(|t| t.as_array())
                    .and_then(|arr| arr.last())
                    .and_then(|v| v.get("url"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                tracks.push(TrackItem {
                    video_id: vid.to_string(),
                    title,
                    artists: vec![artist],
                    album: None,
                    duration_seconds: Some(dur),
                    duration_formatted: Some(format_seconds(dur)),
                    thumbnail_url: thumb,
                    url: format!("https://music.youtube.com/watch?v={vid}"),
                    year: None,
                    genre: Some("Pop".to_string()),
                });
            }
        }
        Ok((playlist_title, tracks))
    }
}
