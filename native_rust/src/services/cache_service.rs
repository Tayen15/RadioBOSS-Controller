use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime};

use id3::frame::{Picture, PictureType};
use id3::{Tag, TagLike, Version};
use tokio::process::Command;

use crate::models::config::AppConfig;
use crate::models::track::{CacheStats, TrackItem};
use crate::services::db_service::DatabaseService;
use crate::services::title_cleaner::sanitize_filename;
use crate::services::ytdlp_service::YtDlpService;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Manages Studio Master local audio cache, FFmpeg transcoding, EBU R128 loudness normalization,
/// ID3v2.3 tags + APIC cover art + sidecar `.jpg`, and LRU disk cleanup.
#[derive(Clone)]
pub struct CacheService {
    db: DatabaseService,
    ytdlp: YtDlpService,
}

impl CacheService {
    pub fn new(db: DatabaseService, ytdlp: YtDlpService) -> Self {
        Self { db, ytdlp }
    }

    pub fn cache_dir(&self, cfg: &AppConfig) -> PathBuf {
        let dir = if !cfg.custom_cache_dir.trim().is_empty() {
            PathBuf::from(cfg.custom_cache_dir.trim())
        } else if !cfg.custom_data_dir.trim().is_empty() {
            PathBuf::from(cfg.custom_data_dir.trim()).join("cache")
        } else {
            self.db.storage_dir().join("cache")
        };
        let _ = fs::create_dir_all(&dir);
        dir
    }

    pub fn find_ffmpeg_binary() -> String {
        let bin_name = if cfg!(target_os = "windows") {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        };
        let mut candidates = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                candidates.push(dir.join(bin_name));
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join(bin_name));
            candidates.push(cwd.join("dist").join(bin_name));
            if let Some(parent) = cwd.parent() {
                candidates.push(parent.join("dist").join(bin_name));
            }
        }
        candidates.push(PathBuf::from(r"D:\Apps\ffmpeg\bin\ffmpeg.exe"));
        candidates.push(PathBuf::from("/usr/bin/ffmpeg"));
        candidates.push(PathBuf::from("/usr/local/bin/ffmpeg"));

        for c in candidates {
            if c.is_file() {
                return c.to_string_lossy().to_string();
            }
        }
        bin_name.to_string()
    }

    pub fn get_cached_file_by_id(&self, cfg: &AppConfig, video_id: &str) -> Option<PathBuf> {
        let clean_id = video_id.trim().trim_end_matches(".mp3");
        if clean_id.is_empty() {
            return None;
        }

        if let Some(row) = self.db.get_cached_track(clean_id) {
            if row.is_cached {
                if let Some(fp) = row.file_path {
                    let p = PathBuf::from(fp);
                    if p.is_file() && fs::metadata(&p).map(|m| m.len() > 50_000).unwrap_or(false) {
                        return Some(p);
                    }
                }
            }
        }

        let dir = self.cache_dir(cfg);
        let direct = dir.join(format!("{clean_id}.mp3"));
        if direct.is_file() && fs::metadata(&direct).map(|m| m.len() > 50_000).unwrap_or(false) {
            return Some(direct);
        }

        None
    }

    pub fn get_cache_stats(&self, cfg: &AppConfig) -> CacheStats {
        let dir = self.cache_dir(cfg);
        let mut total_files = 0usize;
        let mut total_size_bytes = 0u64;

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        total_files += 1;
                        total_size_bytes += meta.len();
                    }
                }
            }
        }

        let size_mb = ((total_size_bytes as f64 / (1024.0 * 1024.0)) * 100.0).round() / 100.0;
        let max_mb = cfg.max_cache_size_mb;
        let used_percent = if max_mb > 0 {
            ((size_mb / max_mb as f64) * 1000.0).round() / 10.0
        } else {
            0.0
        };

        CacheStats {
            cache_dir: dir.to_string_lossy().to_string(),
            storage_dir: self.db.storage_dir().to_string_lossy().to_string(),
            db_path: self.db.db_path().to_string_lossy().to_string(),
            total_files,
            total_size_bytes,
            total_size_mb: size_mb,
            max_cache_size_mb: max_mb,
            used_percent: used_percent.min(100.0),
            auto_cleanup_cache: cfg.auto_cleanup_cache,
        }
    }

    pub fn enforce_cache_limit(&self, cfg: &AppConfig, override_max_mb: Option<u64>) -> usize {
        let limit_mb = override_max_mb.unwrap_or(cfg.max_cache_size_mb);
        if limit_mb == 0 {
            return 0;
        }
        let limit_bytes = limit_mb * 1024 * 1024;
        let dir = self.cache_dir(cfg);

        let mut files: Vec<(PathBuf, u64, SystemTime)> = Vec::new();
        let mut total_size: u64 = 0;
        if let Ok(entries) = fs::read_dir(&dir) {
            for e in entries.flatten() {
                if let Ok(m) = e.metadata() {
                    if m.is_file() {
                        let len = m.len();
                        let modified = m.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                        total_size += len;
                        files.push((e.path(), len, modified));
                    }
                }
            }
        }

        if total_size <= limit_bytes {
            return 0;
        }

        let target_size = (limit_bytes as f64 * 0.90) as u64;
        let mut pruned = 0usize;

        // First evict least-played / oldest tracks recorded in DB
        let mut tracked = self.db.get_rotation_ready_tracks(500);
        tracked.sort_by_key(|c| c.play_count);
        for c in tracked {
            if total_size <= target_size {
                break;
            }
            if let Some(ref fp) = c.file_path {
                let p = PathBuf::from(fp);
                if p.is_file() {
                    let len = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                    if fs::remove_file(&p).is_ok() {
                        total_size = total_size.saturating_sub(len);
                        pruned += 1;
                        self.db.mark_video_evicted(&c.video_id);
                        // Also remove sidecar jpg if exists
                        let jpg = p.with_extension("jpg");
                        let _ = fs::remove_file(jpg);
                    }
                }
            }
        }

        // Fallback: remove oldest modified files if still over budget
        if total_size > target_size {
            files.sort_by_key(|f| f.2);
            for (p, len, _) in files {
                if total_size <= target_size {
                    break;
                }
                if p.is_file() && fs::remove_file(&p).is_ok() {
                    total_size = total_size.saturating_sub(len);
                    pruned += 1;
                }
            }
        }

        pruned
    }

    pub fn clear_cache(&self, cfg: &AppConfig, older_than_days: Option<u64>) -> usize {
        let dir = self.cache_dir(cfg);
        let cutoff = older_than_days.map(|d| {
            SystemTime::now()
                .checked_sub(Duration::from_secs(d * 86400))
                .unwrap_or(SystemTime::UNIX_EPOCH)
        });
        let mut deleted = 0usize;

        if let Ok(entries) = fs::read_dir(&dir) {
            for e in entries.flatten() {
                if let Ok(m) = e.metadata() {
                    if m.is_file() {
                        let should_del = match cutoff {
                            Some(c) => m.modified().unwrap_or(SystemTime::now()) < c,
                            None => true,
                        };
                        if should_del && fs::remove_file(e.path()).is_ok() {
                            deleted += 1;
                        }
                    }
                }
            }
        }
        if older_than_days.is_none() {
            self.db.mark_cache_cleared();
        }
        deleted
    }

    /// Downloads/transcodes audio to local MP3 with ID3v2.3 tags, Year, Genre,
    /// embedded MJPEG cover art, and sidecar `.jpg` for RadioBOSS native cover reader.
    pub async fn prepare_studio_cache(&self, cfg: &AppConfig, track: &TrackItem) -> Option<PathBuf> {
        let clean_id = track.video_id.trim().trim_end_matches(".mp3").to_string();
        let cache_dir = self.cache_dir(cfg);

        let artist = track.artists_joined();
        let raw_base = if !artist.is_empty() && artist != "Unknown Artist" {
            format!("{artist} - {}", track.title)
        } else {
            track.title.clone()
        };
        let safe_name = {
            let s = sanitize_filename(&raw_base);
            if s.is_empty() {
                clean_id.clone()
            } else {
                s
            }
        };

        let target_mp3 = cache_dir.join(format!("{safe_name}.mp3"));
        let target_cover = cache_dir.join(format!("{safe_name}.jpg"));

        // Reuse existing valid cache (> 100 KB)
        if target_mp3.is_file() && fs::metadata(&target_mp3).map(|m| m.len() > 102_400).unwrap_or(false) {
            let sz = fs::metadata(&target_mp3).map(|m| m.len()).unwrap_or(0);
            self.db
                .record_track_play(track, Some(&target_mp3.to_string_lossy()), sz, true);
            return Some(target_mp3);
        }

        // Resolve stream URL & metadata
        let stream_url = self.ytdlp.get_live_stream_url(&clean_id).await;
        let cached_meta = self.ytdlp.get_cached_meta(&clean_id);
        let thumb_url = track
            .thumbnail_url
            .clone()
            .or(cached_meta.thumbnail_url.clone());
        let year = track.year.clone().unwrap_or_else(|| cached_meta.year.clone());
        let genre = track
            .genre
            .clone()
            .filter(|g| !g.is_empty() && g != "Radio Request")
            .unwrap_or_else(|| cached_meta.genre.clone());
        let album = track.album.clone().unwrap_or_else(|| cached_meta.album.clone());

        // Download cover art thumbnail to sidecar .jpg
        let mut has_cover = false;
        if let Some(ref u) = thumb_url {
            if let Ok(resp) = reqwest::get(u).await {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        if bytes.len() > 1000 && fs::write(&target_cover, &bytes).is_ok() {
                            has_cover = true;
                        }
                    }
                }
            }
        }

        let ffmpeg_bin = Self::find_ffmpeg_binary();
        let mut transcode_ok = false;

        // Attempt 1: Direct FFmpeg network stream transcode
        if let Some(ref s_url) = stream_url {
            transcode_ok = Self::run_ffmpeg_transcode(
                &ffmpeg_bin,
                s_url,
                &target_mp3,
                if has_cover { Some(&target_cover) } else { None },
                &track.title,
                &artist,
                &album,
                &year,
                &genre,
                true,
                cfg,
            )
            .await;
        }

        // Attempt 2: Fallback chunked yt-dlp download + local FFmpeg transcode
        if !transcode_ok {
            if let Some(raw_file) = self.ytdlp.download_audio_raw(&clean_id, &cache_dir).await {
                transcode_ok = Self::run_ffmpeg_transcode(
                    &ffmpeg_bin,
                    &raw_file.to_string_lossy(),
                    &target_mp3,
                    if has_cover { Some(&target_cover) } else { None },
                    &track.title,
                    &artist,
                    &album,
                    &year,
                    &genre,
                    false,
                    cfg,
                )
                .await;
                let _ = fs::remove_file(raw_file);
            }
        }

        if transcode_ok
            && target_mp3.is_file()
            && fs::metadata(&target_mp3).map(|m| m.len() > 50_000).unwrap_or(false)
        {
            // Ensure ID3v2.3 tags + APIC image via pure Rust id3 crate as dual guarantee
            Self::ensure_id3_tags(
                &target_mp3,
                if has_cover { Some(&target_cover) } else { None },
                &track.title,
                &artist,
                &album,
                &year,
                &genre,
            );
            let sz = fs::metadata(&target_mp3).map(|m| m.len()).unwrap_or(0);
            self.db
                .record_track_play(track, Some(&target_mp3.to_string_lossy()), sz, true);
            if cfg.auto_cleanup_cache {
                self.enforce_cache_limit(cfg, None);
            }
            return Some(target_mp3);
        }

        let _ = fs::remove_file(&target_mp3);
        None
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_ffmpeg_transcode(
        ffmpeg_bin: &str,
        input_source: &str,
        target_mp3: &Path,
        cover_path: Option<&Path>,
        title: &str,
        artist: &str,
        album: &str,
        year: &str,
        genre: &str,
        is_network_stream: bool,
        cfg: &AppConfig,
    ) -> bool {
        let mut cmd = Command::new(ffmpeg_bin);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.arg("-y");
        if is_network_stream {
            cmd.args(["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"]);
        }
        cmd.args(["-i", input_source]);

        if let Some(cp) = cover_path {
            if cp.is_file() {
                cmd.args([
                    "-i",
                    &cp.to_string_lossy(),
                    "-map",
                    "0:a",
                    "-map",
                    "1:v",
                    "-c:v",
                    "mjpeg",
                    "-metadata:s:v",
                    "title=Album cover",
                    "-metadata:s:v",
                    "comment=Cover (front)",
                ]);
            } else {
                cmd.arg("-vn");
            }
        } else {
            cmd.arg("-vn");
        }

        if cfg.enable_loudnorm {
            cmd.args(["-af", "loudnorm=I=-14:LRA=7:tp=-1.5"]);
        }

        let bitrate = if cfg.audio_quality.ends_with('k') {
            cfg.audio_quality.clone()
        } else if cfg.audio_quality.is_empty() {
            "320k".to_string()
        } else {
            format!("{}k", cfg.audio_quality)
        };

        let meta_title = format!("title={title}");
        let meta_artist = format!("artist={}", if artist.is_empty() { "YouTube Music" } else { artist });
        let meta_album = format!("album={}", if album.is_empty() { "Single" } else { album });
        let meta_year = format!("year={year}");
        let meta_date = format!("date={year}");
        let meta_genre = format!("genre={}", if genre.is_empty() { "Pop" } else { genre });

        cmd.args([
            "-c:a",
            "libmp3lame",
            "-b:a",
            &bitrate,
            "-id3v2_version",
            "3",
            "-write_id3v1",
            "1",
            "-metadata",
            &meta_title,
            "-metadata",
            &meta_artist,
            "-metadata",
            &meta_album,
            "-metadata",
            &meta_date,
            "-metadata",
            &meta_year,
            "-metadata",
            &meta_genre,
            &target_mp3.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

        matches!(
            tokio::time::timeout(Duration::from_secs(75), cmd.status()).await,
            Ok(Ok(st)) if st.success()
        )
    }

    fn ensure_id3_tags(
        mp3_path: &Path,
        cover_path: Option<&Path>,
        title: &str,
        artist: &str,
        album: &str,
        year: &str,
        genre: &str,
    ) {
        let mut tag = Tag::read_from_path(mp3_path).unwrap_or_default();
        tag.set_title(title);
        tag.set_artist(if artist.is_empty() { "YouTube Music" } else { artist });
        tag.set_album(if album.is_empty() { "Single" } else { album });
        tag.set_genre(if genre.is_empty() { "Pop" } else { genre });
        if let Some(y) = year.get(..4).and_then(|s| s.parse::<i32>().ok()) {
            tag.set_year(y);
        }
        if let Some(cp) = cover_path {
            if let Ok(img_bytes) = fs::read(cp) {
                tag.remove_all_pictures();
                tag.add_frame(Picture {
                    mime_type: "image/jpeg".to_string(),
                    picture_type: PictureType::CoverFront,
                    description: "Cover (front)".to_string(),
                    data: img_bytes,
                });
            }
        }
        let _ = tag.write_to_path(mp3_path, Version::Id3v23);
    }
}
