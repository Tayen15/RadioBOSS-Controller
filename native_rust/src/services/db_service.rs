use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::{Local, TimeZone};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use crate::models::track::{
    CachedTrackItem, DjArtistStat, HistoryItem, PlaylistSet, PlaylistSetItem, TrackItem,
};

/// Resolves the active storage directory matching the Python production layout:
/// 1. Portable Mode (`--portable`, `portable.txt`, `portable/`, or `./data/` next to executable)
/// 2. Windows `%APPDATA%/RadioBOSSCaster` or Linux `~/.config/RadioBOSSCaster`
/// 3. Optional `storage_location.txt` override inside the default directory
pub fn resolve_active_storage_dir() -> PathBuf {
    // 1. Check Portable Mode next to executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(app_root) = exe_path.parent() {
            let has_flag = std::env::args().any(|a| a == "--portable");
            if has_flag
                || app_root.join("portable.txt").is_file()
                || app_root.join("portable").is_dir()
                || app_root.join("data").is_dir()
            {
                let portable_dir = app_root.join("data");
                let _ = fs::create_dir_all(&portable_dir);
                return portable_dir;
            }
        }
    }

    // 2. System default directory
    let base_dir = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                std::env::var_os("USERPROFILE")
                    .map(|p| PathBuf::from(p).join("AppData").join("Roaming"))
                    .unwrap_or_else(|| PathBuf::from("."))
            })
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                std::env::var_os("HOME")
                    .map(|p| PathBuf::from(p).join(".config"))
                    .unwrap_or_else(|| PathBuf::from("."))
            })
    };

    let default_dir = base_dir.join("RadioBOSSCaster");
    let _ = fs::create_dir_all(&default_dir);

    // 3. Check custom pointer `storage_location.txt`
    let pointer_file = default_dir.join("storage_location.txt");
    if pointer_file.is_file() {
        if let Ok(raw) = fs::read_to_string(&pointer_file) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                let custom_dir = PathBuf::from(trimmed);
                if fs::create_dir_all(&custom_dir).is_ok() {
                    return custom_dir;
                }
            }
        }
    }

    default_dir
}

pub fn get_default_system_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."))
            .join("RadioBOSSCaster")
    } else {
        std::env::var_os("HOME")
            .map(|p| PathBuf::from(p).join(".config"))
            .unwrap_or_else(|| PathBuf::from("."))
            .join("RadioBOSSCaster")
    }
}

/// Thread-safe SQLite database service with 100% schema compatibility with `main`.
#[derive(Clone)]
pub struct DatabaseService {
    inner: Arc<Mutex<DbInner>>,
}

struct DbInner {
    storage_dir: PathBuf,
    db_path: PathBuf,
    conn: Connection,
}

impl DatabaseService {
    pub fn new() -> Result<Self, rusqlite::Error> {
        let storage_dir = resolve_active_storage_dir();
        let db_path = storage_dir.join("radioboss_caster.db");
        let conn = Self::open_and_init(&db_path)?;
        Ok(Self {
            inner: Arc::new(Mutex::new(DbInner {
                storage_dir,
                db_path,
                conn,
            })),
        })
    }

    fn open_and_init(db_path: &Path) -> Result<Connection, rusqlite::Error> {
        if let Some(parent) = db_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(15))?;
        conn.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            PRAGMA synchronous=NORMAL;
            PRAGMA cache_size=-2000;
            PRAGMA wal_autocheckpoint=500;

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS queue_history (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artists TEXT,
                album TEXT,
                year TEXT,
                genre TEXT,
                thumbnail_url TEXT,
                pos INTEGER DEFAULT -1,
                timestamp TEXT,
                status TEXT DEFAULT 'success',
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_history_created_at
            ON queue_history (created_at DESC);

            CREATE TABLE IF NOT EXISTS playlist_sets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_set_items (
                id TEXT PRIMARY KEY,
                set_id TEXT NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artists TEXT,
                album TEXT,
                year TEXT,
                genre TEXT,
                thumbnail_url TEXT,
                duration_seconds INTEGER DEFAULT 0,
                duration_formatted TEXT DEFAULT '00:00',
                order_index INTEGER DEFAULT 0,
                FOREIGN KEY (set_id) REFERENCES playlist_sets(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_set_items_order
            ON playlist_set_items (set_id, order_index ASC);

            CREATE TABLE IF NOT EXISTS cached_tracks (
                video_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT DEFAULT '',
                album TEXT DEFAULT '',
                year TEXT DEFAULT '',
                genre TEXT DEFAULT '',
                file_path TEXT DEFAULT '',
                thumbnail_url TEXT DEFAULT '',
                duration_seconds INTEGER DEFAULT 0,
                duration_formatted TEXT DEFAULT '00:00',
                file_size_bytes INTEGER DEFAULT 0,
                play_count INTEGER DEFAULT 0,
                last_played_at REAL DEFAULT NULL,
                is_cached INTEGER DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_cached_tracks_play_count
            ON cached_tracks (play_count DESC);
            CREATE INDEX IF NOT EXISTS idx_cached_tracks_last_played
            ON cached_tracks (last_played_at DESC);

            CREATE TABLE IF NOT EXISTS telemetry_outbox (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT DEFAULT '',
                clean_title TEXT DEFAULT '',
                clean_artist TEXT DEFAULT '',
                album TEXT DEFAULT '',
                genre TEXT DEFAULT 'Pop',
                thumbnail_url TEXT DEFAULT '',
                duration_seconds INTEGER DEFAULT 0,
                duration_formatted TEXT DEFAULT '00:00',
                action_type TEXT DEFAULT 'queue_bottom',
                time_belt TEXT DEFAULT 'morning',
                timestamp REAL NOT NULL,
                retry_count INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_telemetry_outbox_created
            ON telemetry_outbox (created_at ASC);

            CREATE TABLE IF NOT EXISTS global_charts_cache (
                category TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS crowd_metadata_cache (
                video_id TEXT PRIMARY KEY,
                clean_title TEXT NOT NULL,
                clean_artist TEXT DEFAULT '',
                original_title TEXT DEFAULT '',
                votes_count INTEGER DEFAULT 0,
                is_crowd_cleaned INTEGER DEFAULT 0,
                cached_at REAL NOT NULL
            );
            ",
        )?;
        Ok(conn)
    }

    pub fn storage_dir(&self) -> PathBuf {
        self.inner.lock().unwrap().storage_dir.clone()
    }

    pub fn db_path(&self) -> PathBuf {
        self.inner.lock().unwrap().db_path.clone()
    }

    pub fn relocate_storage(&self, new_dir_str: &str) -> Result<PathBuf, String> {
        let new_dir = if new_dir_str.trim().is_empty() {
            get_default_system_dir()
        } else {
            PathBuf::from(new_dir_str.trim())
        };
        fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;

        let new_db_path = new_dir.join("radioboss_caster.db");
        let mut guard = self.inner.lock().unwrap();
        let old_db_path = guard.db_path.clone();

        if new_db_path != old_db_path {
            if !new_db_path.exists() && old_db_path.exists() {
                let _ = guard.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
                let _ = fs::copy(&old_db_path, &new_db_path);
            }
            let new_conn = Self::open_and_init(&new_db_path).map_err(|e| e.to_string())?;
            guard.conn = new_conn;
            guard.db_path = new_db_path;
            guard.storage_dir = new_dir.clone();

            // Persist storage_location.txt pointer
            let default_dir = get_default_system_dir();
            let _ = fs::create_dir_all(&default_dir);
            let pointer_file = default_dir.join("storage_location.txt");
            if new_dir == default_dir {
                let _ = fs::remove_file(pointer_file);
            } else {
                let _ = fs::write(pointer_file, new_dir.to_string_lossy().as_bytes());
            }
        }
        Ok(guard.storage_dir.clone())
    }

    // -------------------------------------------------------------------------
    // Settings Operations
    // -------------------------------------------------------------------------

    pub fn get_all_settings(&self) -> serde_json::Map<String, Value> {
        let guard = self.inner.lock().unwrap();
        let mut map = serde_json::Map::new();
        if let Ok(mut stmt) = guard.conn.prepare("SELECT key, value FROM settings") {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            }) {
                for (k, v) in rows.flatten() {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&v) {
                        map.insert(k, parsed);
                    }
                }
            }
        }
        map
    }

    pub fn save_all_settings(&self, settings_map: &serde_json::Map<String, Value>) {
        let guard = self.inner.lock().unwrap();
        let now = now_unix_f64();
        let tx_res = guard.conn.unchecked_transaction();
        if let Ok(tx) = tx_res {
            for (k, v) in settings_map {
                if let Ok(json_str) = serde_json::to_string(v) {
                    let _ = tx.execute(
                        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                        params![k, json_str, now],
                    );
                }
            }
            let _ = tx.commit();
        }
    }

    // -------------------------------------------------------------------------
    // Queue History Operations
    // -------------------------------------------------------------------------

    pub fn get_history(&self, limit: usize) -> Vec<HistoryItem> {
        let guard = self.inner.lock().unwrap();
        let mut list = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT id, video_id, title, artists, thumbnail_url, pos, timestamp, status
             FROM queue_history ORDER BY created_at DESC LIMIT ?1",
        ) {
            if let Ok(rows) = stmt.query_map(params![limit as i64], |row| {
                let artists_json: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
                let artists: Vec<String> =
                    serde_json::from_str(&artists_json).unwrap_or_default();
                Ok(HistoryItem {
                    id: row.get(0)?,
                    video_id: row.get(1)?,
                    title: row.get(2)?,
                    artists,
                    thumbnail_url: row.get(4)?,
                    pos: row.get(5)?,
                    timestamp: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    status: row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "success".to_string()),
                })
            }) {
                for r in rows.flatten() {
                    list.push(r);
                }
            }
        }
        list
    }

    pub fn add_history_item(&self, item: &HistoryItem) {
        let guard = self.inner.lock().unwrap();
        let now = now_unix_f64();
        let artists_json = serde_json::to_string(&item.artists).unwrap_or_else(|_| "[]".into());
        let _ = guard.conn.execute(
            "INSERT OR REPLACE INTO queue_history
             (id, video_id, title, artists, thumbnail_url, pos, timestamp, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                item.id,
                item.video_id,
                item.title,
                artists_json,
                item.thumbnail_url,
                item.pos,
                item.timestamp,
                item.status,
                now
            ],
        );
    }

    pub fn clear_history(&self) {
        let guard = self.inner.lock().unwrap();
        let _ = guard.conn.execute("DELETE FROM queue_history", []);
    }

    pub fn count_songs_today(&self) -> u64 {
        let guard = self.inner.lock().unwrap();
        let today = Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
        let midnight = Local
            .from_local_datetime(&today)
            .single()
            .map(|dt| dt.timestamp() as f64)
            .unwrap_or(0.0);
        guard
            .conn
            .query_row(
                "SELECT COUNT(*) FROM queue_history WHERE created_at >= ?1",
                params![midnight],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0)
            .max(0) as u64
    }

    // -------------------------------------------------------------------------
    // Cached Tracks & DJ Airplay Tracking
    // -------------------------------------------------------------------------

    pub fn record_track_play(
        &self,
        track: &TrackItem,
        file_path: Option<&str>,
        file_size_bytes: u64,
        is_cached: bool,
    ) {
        let guard = self.inner.lock().unwrap();
        let now = now_unix_f64();
        let artist = track.artists_joined();
        let album = track.album.clone().unwrap_or_default();
        let year = track.year.clone().unwrap_or_default();
        let genre = track.genre.clone().unwrap_or_default();
        let thumb = track.thumbnail_url.clone().unwrap_or_default();
        let dur_sec = track.duration_seconds.unwrap_or(0) as i64;
        let dur_fmt = track
            .duration_formatted
            .clone()
            .unwrap_or_else(|| "00:00".to_string());
        let fp = file_path.unwrap_or("");
        let cached_int: i32 = if is_cached { 1 } else { 0 };

        let _ = guard.conn.execute(
            "INSERT INTO cached_tracks (
                video_id, title, artist, album, year, genre, file_path, thumbnail_url,
                duration_seconds, duration_formatted, file_size_bytes, play_count,
                last_played_at, is_cached, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?13, ?12, ?12)
            ON CONFLICT(video_id) DO UPDATE SET
                title = COALESCE(NULLIF(excluded.title, ''), cached_tracks.title),
                artist = COALESCE(NULLIF(excluded.artist, ''), cached_tracks.artist),
                album = COALESCE(NULLIF(excluded.album, ''), cached_tracks.album),
                year = COALESCE(NULLIF(excluded.year, ''), cached_tracks.year),
                genre = COALESCE(NULLIF(excluded.genre, ''), cached_tracks.genre),
                file_path = CASE WHEN excluded.file_path != '' THEN excluded.file_path ELSE cached_tracks.file_path END,
                thumbnail_url = COALESCE(NULLIF(excluded.thumbnail_url, ''), cached_tracks.thumbnail_url),
                duration_seconds = CASE WHEN excluded.duration_seconds > 0 THEN excluded.duration_seconds ELSE cached_tracks.duration_seconds END,
                duration_formatted = CASE WHEN excluded.duration_formatted != '00:00' THEN excluded.duration_formatted ELSE cached_tracks.duration_formatted END,
                file_size_bytes = CASE WHEN excluded.file_size_bytes > 0 THEN excluded.file_size_bytes ELSE cached_tracks.file_size_bytes END,
                is_cached = MAX(cached_tracks.is_cached, excluded.is_cached),
                play_count = cached_tracks.play_count + 1,
                last_played_at = excluded.last_played_at,
                updated_at = excluded.updated_at",
            params![
                track.video_id,
                track.title,
                artist,
                album,
                year,
                genre,
                fp,
                thumb,
                dur_sec,
                dur_fmt,
                file_size_bytes as i64,
                now,
                cached_int
            ],
        );
    }

    pub fn get_cached_track(&self, video_id: &str) -> Option<CachedTrackItem> {
        let guard = self.inner.lock().unwrap();
        let mut stmt = guard
            .conn
            .prepare(
                "SELECT video_id, title, artist, album, year, genre, file_path, thumbnail_url,
                 duration_seconds, duration_formatted, file_size_bytes, play_count, last_played_at, is_cached
                 FROM cached_tracks WHERE video_id = ?1",
            )
            .ok()?;
        stmt.query_row(params![video_id], |row| row_to_cached_track(row, None))
            .optional()
            .ok()
            .flatten()
    }

    pub fn get_dj_top_chart(&self, limit: usize) -> Vec<CachedTrackItem> {
        let guard = self.inner.lock().unwrap();
        let mut list = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT video_id, title, artist, album, year, genre, file_path, thumbnail_url,
             duration_seconds, duration_formatted, file_size_bytes, play_count, last_played_at, is_cached
             FROM cached_tracks
             WHERE play_count > 0
             ORDER BY play_count DESC, last_played_at DESC
             LIMIT ?1",
        ) {
            if let Ok(rows) = stmt.query_map(params![limit as i64], |row| row_to_cached_track(row, None)) {
                for (idx, item) in rows.flatten().enumerate() {
                    let mut c = item;
                    c.rank = Some(idx + 1);
                    list.push(c);
                }
            }
        }
        list
    }

    pub fn get_all_cached_tracks(&self, limit: usize) -> Vec<CachedTrackItem> {
        let guard = self.inner.lock().unwrap();
        let mut list = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT video_id, title, artist, album, year, genre, file_path, thumbnail_url,
             duration_seconds, duration_formatted, file_size_bytes, play_count, last_played_at, is_cached
             FROM cached_tracks
             ORDER BY is_cached DESC, play_count DESC, updated_at DESC
             LIMIT ?1",
        ) {
            if let Ok(rows) = stmt.query_map(params![limit as i64], |row| row_to_cached_track(row, None)) {
                for (idx, item) in rows.flatten().enumerate() {
                    let mut c = item;
                    c.rank = Some(idx + 1);
                    list.push(c);
                }
            }
        }
        list
    }

    pub fn get_top_dj_artists(&self, limit: usize) -> Vec<DjArtistStat> {
        let guard = self.inner.lock().unwrap();
        let mut list = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT artist, SUM(play_count) as total_plays, COUNT(*) as tracks
             FROM cached_tracks
             WHERE artist != '' AND play_count > 0
             GROUP BY artist
             ORDER BY total_plays DESC
             LIMIT ?1",
        ) {
            if let Ok(rows) = stmt.query_map(params![limit as i64], |row| {
                Ok(DjArtistStat {
                    artist: row.get(0)?,
                    play_count: row.get::<_, i64>(1)?.max(0) as u64,
                    track_count: row.get::<_, i64>(2)?.max(0) as u64,
                })
            }) {
                for r in rows.flatten() {
                    list.push(r);
                }
            }
        }
        list
    }

    pub fn get_rotation_ready_tracks(&self, limit: usize) -> Vec<CachedTrackItem> {
        let guard = self.inner.lock().unwrap();
        let mut list = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT video_id, title, artist, album, year, genre, file_path, thumbnail_url,
             duration_seconds, duration_formatted, file_size_bytes, play_count, last_played_at, is_cached
             FROM cached_tracks
             WHERE is_cached = 1 OR play_count > 0
             ORDER BY COALESCE(last_played_at, 0) ASC, play_count DESC
             LIMIT ?1",
        ) {
            if let Ok(rows) = stmt.query_map(params![limit as i64], |row| row_to_cached_track(row, None)) {
                for r in rows.flatten() {
                    list.push(r);
                }
            }
        }
        list
    }

    pub fn mark_cache_cleared(&self) {
        let guard = self.inner.lock().unwrap();
        let _ = guard.conn.execute(
            "UPDATE cached_tracks SET is_cached = 0, file_path = '', file_size_bytes = 0",
            [],
        );
    }

    pub fn mark_video_evicted(&self, video_id: &str) {
        let guard = self.inner.lock().unwrap();
        let _ = guard.conn.execute(
            "UPDATE cached_tracks SET is_cached = 0, file_path = '', file_size_bytes = 0 WHERE video_id = ?1",
            params![video_id],
        );
    }

    // -------------------------------------------------------------------------
    // Playlist Sets Operations
    // -------------------------------------------------------------------------

    pub fn get_playlist_sets(&self) -> Vec<PlaylistSet> {
        let guard = self.inner.lock().unwrap();
        let mut list = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT ps.id, ps.name, COALESCE(ps.description, ''), ps.created_at, ps.updated_at,
                    (SELECT COUNT(*) FROM playlist_set_items psi WHERE psi.set_id = ps.id) as track_count
             FROM playlist_sets ps
             ORDER BY ps.updated_at DESC",
        ) {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok(PlaylistSet {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    track_count: row.get::<_, i64>(5)?.max(0) as usize,
                })
            }) {
                for r in rows.flatten() {
                    list.push(r);
                }
            }
        }
        list
    }

    pub fn create_playlist_set(&self, name: &str, description: &str) -> Result<PlaylistSet, String> {
        let guard = self.inner.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_unix_f64();
        guard
            .conn
            .execute(
                "INSERT INTO playlist_sets (id, name, description, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![id, name.trim(), description.trim(), now],
            )
            .map_err(|e| e.to_string())?;
        Ok(PlaylistSet {
            id,
            name: name.trim().to_string(),
            description: description.trim().to_string(),
            created_at: now,
            updated_at: now,
            track_count: 0,
        })
    }

    pub fn delete_playlist_set(&self, set_id: &str) -> Result<(), String> {
        let guard = self.inner.lock().unwrap();
        guard
            .conn
            .execute("DELETE FROM playlist_sets WHERE id = ?1", params![set_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_playlist_set_items(&self, set_id: &str) -> Vec<PlaylistSetItem> {
        let guard = self.inner.lock().unwrap();
        let mut list = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT id, set_id, video_id, title, artists, album, year, genre,
                    thumbnail_url, duration_seconds, duration_formatted, order_index
             FROM playlist_set_items
             WHERE set_id = ?1
             ORDER BY order_index ASC",
        ) {
            if let Ok(rows) = stmt.query_map(params![set_id], |row| {
                let artists_json: String = row.get::<_, Option<String>>(4)?.unwrap_or_default();
                let artists: Vec<String> =
                    serde_json::from_str(&artists_json).unwrap_or_default();
                Ok(PlaylistSetItem {
                    id: row.get(0)?,
                    set_id: row.get(1)?,
                    video_id: row.get(2)?,
                    title: row.get(3)?,
                    artists,
                    album: row.get(5)?,
                    year: row.get(6)?,
                    genre: row.get(7)?,
                    thumbnail_url: row.get(8)?,
                    duration_seconds: row.get::<_, i64>(9)?.max(0) as u64,
                    duration_formatted: row.get::<_, Option<String>>(10)?.unwrap_or_else(|| "00:00".into()),
                    order_index: row.get(11)?,
                })
            }) {
                for r in rows.flatten() {
                    list.push(r);
                }
            }
        }
        list
    }

    pub fn add_track_to_set(&self, set_id: &str, track: &TrackItem) -> Result<(), String> {
        let guard = self.inner.lock().unwrap();
        let next_idx: i32 = guard
            .conn
            .query_row(
                "SELECT COALESCE(MAX(order_index), -1) + 1 FROM playlist_set_items WHERE set_id = ?1",
                params![set_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let item_id = uuid::Uuid::new_v4().to_string();
        let artists_json = serde_json::to_string(&track.artists).unwrap_or_else(|_| "[]".into());
        let dur_sec = track.duration_seconds.unwrap_or(0) as i64;
        let dur_fmt = track
            .duration_formatted
            .clone()
            .unwrap_or_else(|| "00:00".into());

        guard
            .conn
            .execute(
                "INSERT INTO playlist_set_items
                 (id, set_id, video_id, title, artists, album, year, genre, thumbnail_url,
                  duration_seconds, duration_formatted, order_index)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    item_id,
                    set_id,
                    track.video_id,
                    track.title,
                    artists_json,
                    track.album,
                    track.year,
                    track.genre,
                    track.thumbnail_url,
                    dur_sec,
                    dur_fmt,
                    next_idx
                ],
            )
            .map_err(|e| e.to_string())?;
        let now = now_unix_f64();
        let _ = guard.conn.execute(
            "UPDATE playlist_sets SET updated_at = ?1 WHERE id = ?2",
            params![now, set_id],
        );
        Ok(())
    }

    pub fn remove_track_from_set(&self, set_id: &str, item_id: &str) {
        let guard = self.inner.lock().unwrap();
        let _ = guard.conn.execute(
            "DELETE FROM playlist_set_items WHERE set_id = ?1 AND id = ?2",
            params![set_id, item_id],
        );
    }

    pub fn clear_playlist_set(&self, set_id: &str) {
        let guard = self.inner.lock().unwrap();
        let _ = guard.conn.execute(
            "DELETE FROM playlist_set_items WHERE set_id = ?1",
            params![set_id],
        );
    }

    pub fn move_set_item(&self, set_id: &str, item_id: &str, direction: i32) {
        let items = self.get_playlist_set_items(set_id);
        let Some(pos) = items.iter().position(|x| x.id == item_id) else {
            return;
        };
        let target_idx = if direction < 0 {
            if pos == 0 {
                return;
            }
            pos - 1
        } else {
            if pos + 1 >= items.len() {
                return;
            }
            pos + 1
        };

        let mut ids: Vec<String> = items.into_iter().map(|i| i.id).collect();
        ids.swap(pos, target_idx);

        let guard = self.inner.lock().unwrap();
        let tx_res = guard.conn.unchecked_transaction();
        if let Ok(tx) = tx_res {
            for (idx, id) in ids.iter().enumerate() {
                let _ = tx.execute(
                    "UPDATE playlist_set_items SET order_index = ?1 WHERE id = ?2",
                    params![idx as i32, id],
                );
            }
            let _ = tx.commit();
        }
    }

    // -------------------------------------------------------------------------
    // Crowd Metadata Cache & Telemetry Outbox
    // -------------------------------------------------------------------------

    pub fn get_crowd_metadata(&self, video_id: &str) -> Option<(String, String, String, u64, bool)> {
        let guard = self.inner.lock().unwrap();
        guard
            .conn
            .query_row(
                "SELECT clean_title, clean_artist, original_title, votes_count, is_crowd_cleaned
                 FROM crowd_metadata_cache WHERE video_id = ?1",
                params![video_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, i64>(3)?.max(0) as u64,
                        r.get::<_, i32>(4)? != 0,
                    ))
                },
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn save_crowd_metadata(
        &self,
        video_id: &str,
        clean_title: &str,
        clean_artist: &str,
        original_title: &str,
        votes_count: u64,
        is_crowd_cleaned: bool,
    ) {
        let guard = self.inner.lock().unwrap();
        let now = now_unix_f64();
        let _ = guard.conn.execute(
            "INSERT OR REPLACE INTO crowd_metadata_cache
             (video_id, clean_title, clean_artist, original_title, votes_count, is_crowd_cleaned, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                video_id,
                clean_title,
                clean_artist,
                original_title,
                votes_count as i64,
                if is_crowd_cleaned { 1 } else { 0 },
                now
            ],
        );
    }

    pub fn enqueue_telemetry_outbox(
        &self,
        track: &TrackItem,
        clean_title: &str,
        clean_artist: &str,
        action_type: &str,
        time_belt: &str,
    ) {
        let guard = self.inner.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_unix_f64();
        let artist = track.artists_joined();
        let album = track.album.clone().unwrap_or_default();
        let genre = track.genre.clone().unwrap_or_else(|| "Pop".into());
        let thumb = track.thumbnail_url.clone().unwrap_or_default();
        let dur_sec = track.duration_seconds.unwrap_or(0) as i64;
        let dur_fmt = track.duration_formatted.clone().unwrap_or_else(|| "00:00".into());

        let _ = guard.conn.execute(
            "INSERT INTO telemetry_outbox
             (id, video_id, title, artist, clean_title, clean_artist, album, genre,
              thumbnail_url, duration_seconds, duration_formatted, action_type, time_belt,
              timestamp, retry_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?14)",
            params![
                id,
                track.video_id,
                track.title,
                artist,
                clean_title,
                clean_artist,
                album,
                genre,
                thumb,
                dur_sec,
                dur_fmt,
                action_type,
                time_belt,
                now
            ],
        );
    }

    pub fn pop_telemetry_outbox(&self, limit: usize) -> Vec<Value> {
        let guard = self.inner.lock().unwrap();
        let mut items = Vec::new();
        if let Ok(mut stmt) = guard.conn.prepare(
            "SELECT id, video_id, title, artist, clean_title, clean_artist, album, genre,
                    thumbnail_url, duration_seconds, duration_formatted, action_type, time_belt, timestamp
             FROM telemetry_outbox ORDER BY created_at ASC LIMIT ?1",
        ) {
            if let Ok(rows) = stmt.query_map(params![limit as i64], |r| {
                Ok(serde_json::json!({
                    "id": r.get::<_, String>(0)?,
                    "video_id": r.get::<_, String>(1)?,
                    "title": r.get::<_, String>(2)?,
                    "artist": r.get::<_, String>(3)?,
                    "clean_title": r.get::<_, String>(4)?,
                    "clean_artist": r.get::<_, String>(5)?,
                    "album": r.get::<_, String>(6)?,
                    "genre": r.get::<_, String>(7)?,
                    "thumbnail_url": r.get::<_, String>(8)?,
                    "duration_seconds": r.get::<_, i64>(9)?,
                    "duration_formatted": r.get::<_, String>(10)?,
                    "action_type": r.get::<_, String>(11)?,
                    "time_belt": r.get::<_, String>(12)?,
                    "timestamp": r.get::<_, f64>(13)?,
                }))
            }) {
                for row in rows.flatten() {
                    items.push(row);
                }
            }
        }
        items
    }

    pub fn delete_telemetry_outbox_ids(&self, ids: &[String]) {
        if ids.is_empty() {
            return;
        }
        let guard = self.inner.lock().unwrap();
        let tx_res = guard.conn.unchecked_transaction();
        if let Ok(tx) = tx_res {
            for id in ids {
                let _ = tx.execute("DELETE FROM telemetry_outbox WHERE id = ?1", params![id]);
            }
            let _ = tx.commit();
        }
    }
}

fn row_to_cached_track(
    row: &rusqlite::Row<'_>,
    rank: Option<usize>,
) -> rusqlite::Result<CachedTrackItem> {
    let play_count = row.get::<_, i64>(11)?.max(0) as u64;
    let file_size_bytes = row.get::<_, i64>(10)?.max(0) as u64;
    let last_played_at: Option<f64> = row.get(12)?;
    let is_cached = row.get::<_, i32>(13)? != 0;
    let file_path_raw: String = row.get::<_, Option<String>>(6)?.unwrap_or_default();
    let rotation_status = if play_count >= 5 {
        "heavy".to_string()
    } else if play_count >= 2 {
        "medium".to_string()
    } else {
        "light".to_string()
    };

    Ok(CachedTrackItem {
        video_id: row.get(0)?,
        title: row.get(1)?,
        artist: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        album: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        year: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        genre: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        file_path: if file_path_raw.is_empty() {
            None
        } else {
            Some(file_path_raw)
        },
        thumbnail_url: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        duration_seconds: row.get::<_, i64>(8)?.max(0) as u64,
        duration_formatted: row
            .get::<_, Option<String>>(9)?
            .unwrap_or_else(|| "00:00".into()),
        file_size_bytes,
        file_size_mb: (file_size_bytes as f64 / (1024.0 * 1024.0) * 10.0).round() / 10.0,
        play_count,
        last_played_at,
        last_played_relative: format_relative_time(last_played_at),
        is_cached,
        rotation_status,
        rank,
    })
}

pub fn format_relative_time(ts: Option<f64>) -> String {
    let Some(t) = ts else {
        return "Belum pernah".to_string();
    };
    let diff = (now_unix_f64() - t).max(0.0) as u64;
    if diff < 60 {
        "Baru saja".to_string()
    } else if diff < 3600 {
        format!("{} menit lalu", diff / 60)
    } else if diff < 86400 {
        format!("{} jam lalu", diff / 3600)
    } else {
        format!("{} hari lalu", diff / 86400)
    }
}

pub fn now_unix_f64() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqlite_schema_and_playlist_sets_crud() {
        let tmp = std::env::temp_dir().join(format!("rcb_test_{}", uuid::Uuid::new_v4()));
        let db_path = tmp.join("radioboss_caster.db");
        let conn = DatabaseService::open_and_init(&db_path).expect("init sqlite");
        let db = DatabaseService {
            inner: Arc::new(Mutex::new(DbInner {
                storage_dir: tmp.clone(),
                db_path,
                conn,
            })),
        };

        let created = db.create_playlist_set("Siaran Pagi", "Lagu Semangat").unwrap();
        let sets = db.get_playlist_sets();
        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].name, "Siaran Pagi");

        let track = TrackItem {
            video_id: "vid123".to_string(),
            title: "Dan...".to_string(),
            artists: vec!["Sheila On 7".to_string()],
            duration_seconds: Some(289),
            duration_formatted: Some("04:49".to_string()),
            url: "https://music.youtube.com/watch?v=vid123".to_string(),
            ..Default::default()
        };
        db.add_track_to_set(&created.id, &track).unwrap();
        let items = db.get_playlist_set_items(&created.id);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Dan...");

        db.record_track_play(&track, None, 0, false);
        db.record_track_play(&track, None, 0, false);
        let chart = db.get_dj_top_chart(5);
        assert_eq!(chart.len(), 1);
        assert_eq!(chart[0].play_count, 2);

        let _ = fs::remove_dir_all(&tmp);
    }
}
