"""Database Service: SQLite-backed persistent storage for settings, queue history, and playlist sets."""
import json
import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _get_default_storage_dir() -> Path:
    """Return default %APPDATA%/RadioBOSSCaster directory."""
    appdata = os.environ.get("APPDATA")
    if appdata:
        base_path = Path(appdata)
    else:
        base_path = Path.home() / "AppData" / "Roaming"
    data_dir = base_path / "RadioBOSSCaster"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def _resolve_active_storage_dir() -> Path:
    """
    Check if user configured a custom data storage directory pointer.
    If storage_location.txt exists with a valid directory, use it.
    Otherwise default to %APPDATA%/RadioBOSSCaster.
    """
    default_dir = _get_default_storage_dir()
    pointer_file = default_dir / "storage_location.txt"

    if pointer_file.is_file():
        try:
            custom_path_str = pointer_file.read_text(encoding="utf-8").strip()
            if custom_path_str:
                custom_dir = Path(custom_path_str)
                custom_dir.mkdir(parents=True, exist_ok=True)
                return custom_dir
        except Exception as e:
            logger.warning(f"Could not read storage_location.txt: {e}")

    return default_dir


class DatabaseService:
    """Manages SQLite database lifecycle, migrations, and operations."""

    def __init__(self):
        self.storage_dir = _resolve_active_storage_dir()
        self.db_path = self.storage_dir / "radioboss_caster.db"
        logger.info(f"DatabaseService using database at: {self.db_path}")
        self._init_database()
        self._auto_migrate_from_legacy_json()

    @contextmanager
    def get_connection(self):
        """Context manager providing a thread-safe connection with Row factory."""
        conn = sqlite3.connect(str(self.db_path), timeout=15.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_database(self):
        """Create tables and indexes if they do not exist."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            # Enable WAL mode for high concurrent throughput
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")

            # 1. Settings Table (key-value store for app configuration)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at REAL NOT NULL
                );
            """)

            # 2. Queue History Table
            cursor.execute("""
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
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_created_at 
                ON queue_history (created_at DESC);
            """)

            # 3. Playlist Sets Table (Caster curated broadcast collections)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS playlist_sets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
            """)

            # 4. Playlist Set Items Table (Tracks within each set)
            cursor.execute("""
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
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_set_items_order 
                ON playlist_set_items (set_id, order_index ASC);
            """)

            # 5. Cached Tracks Table (Smart Audio Cache & DJ Play Tracking)
            cursor.execute("""
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
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_cached_tracks_play_count 
                ON cached_tracks (play_count DESC);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_cached_tracks_last_played 
                ON cached_tracks (last_played_at DESC);
            """)

    def _auto_migrate_from_legacy_json(self):
        """Automatically import data from legacy config.json and history.json if available."""
        default_dir = _get_default_storage_dir()

        # Migrate settings if table is empty
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM settings;")
                count = cursor.fetchone()[0]
                if count == 0:
                    legacy_config = default_dir / "config.json"
                    if legacy_config.is_file():
                        try:
                            with open(legacy_config, "r", encoding="utf-8") as f:
                                data = json.load(f)
                            now = time.time()
                            for k, v in data.items():
                                cursor.execute(
                                    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);",
                                    (k, json.dumps(v), now),
                                )
                            logger.info(f"Migrated {len(data)} settings from legacy config.json into SQLite.")
                        except Exception as e:
                            logger.warning(f"Failed migrating config.json: {e}")
        except Exception as e:
            logger.warning(f"Error checking settings migration: {e}")

        # Migrate queue history if table is empty
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM queue_history;")
                hist_count = cursor.fetchone()[0]
                if hist_count == 0:
                    legacy_hist = default_dir / "history.json"
                    if legacy_hist.is_file():
                        try:
                            with open(legacy_hist, "r", encoding="utf-8") as f:
                                items = json.load(f)
                            if isinstance(items, list):
                                for item in items:
                                    item_id = str(item.get("id") or f"{time.time()}-{item.get('video_id')}")
                                    cursor.execute(
                                        """
                                        INSERT OR IGNORE INTO queue_history 
                                        (id, video_id, title, artists, album, year, genre, thumbnail_url, pos, timestamp, status, created_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                                        """,
                                        (
                                            item_id,
                                            item.get("video_id", ""),
                                            item.get("title", "Unknown"),
                                            json.dumps(item.get("artists", [])),
                                            item.get("album", ""),
                                            str(item.get("year", "")),
                                            item.get("genre", "Pop"),
                                            item.get("thumbnail_url", ""),
                                            int(item.get("pos", -1)),
                                            str(item.get("timestamp", "")),
                                            str(item.get("status", "success")),
                                            float(item.get("created_at") or time.time()),
                                        ),
                                    )
                                logger.info(f"Migrated {len(items)} history entries from legacy history.json into SQLite.")
                        except Exception as e:
                            logger.warning(f"Failed migrating history.json: {e}")
        except Exception as e:
            logger.warning(f"Error checking history migration: {e}")

        # Seed cached_tracks play counts from queue_history if cached_tracks table is empty
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM cached_tracks;")
                c_count = cursor.fetchone()[0]
                if c_count == 0:
                    cursor.execute("""
                        SELECT video_id, title, artists, album, year, genre, thumbnail_url,
                               COUNT(*) as cnt, MAX(created_at) as last_play, MIN(created_at) as first_play
                        FROM queue_history
                        GROUP BY video_id;
                    """)
                    rows = cursor.fetchall()
                    now = time.time()
                    for r in rows:
                        vid = r["video_id"]
                        artists_raw = r["artists"]
                        artist = ""
                        if artists_raw:
                            try:
                                parsed = json.loads(artists_raw)
                                if isinstance(parsed, list) and len(parsed) > 0:
                                    artist = parsed[0]
                                else:
                                    artist = str(parsed)
                            except Exception:
                                artist = str(artists_raw)
                        cursor.execute("""
                            INSERT OR IGNORE INTO cached_tracks
                            (video_id, title, artist, album, year, genre, thumbnail_url, play_count, last_played_at, is_cached, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
                        """, (
                            vid,
                            r["title"] or "Unknown",
                            artist,
                            r["album"] or "",
                            r["year"] or "",
                            r["genre"] or "",
                            r["thumbnail_url"] or "",
                            r["cnt"] or 1,
                            r["last_play"] or now,
                            r["first_play"] or now,
                            now,
                        ))
                    if rows:
                        logger.info(f"Seeded {len(rows)} tracks with play counts from queue_history into cached_tracks.")
        except Exception as e:
            logger.warning(f"Error seeding cached_tracks from history: {e}")

    # ==========================================
    # Settings Repository Operations
    # ==========================================

    def get_setting(self, key: str, default: Any = None) -> Any:
        """Retrieve a setting value parsed from JSON string."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = ?;", (key,))
            row = cursor.fetchone()
            if row:
                try:
                    return json.loads(row["value"])
                except Exception:
                    return row["value"]
        return default

    def set_setting(self, key: str, value: Any):
        """Insert or update a setting value."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);",
                (key, json.dumps(value), time.time()),
            )

    def get_all_settings(self) -> Dict[str, Any]:
        """Retrieve all configuration keys and values."""
        results = {}
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM settings;")
            for row in cursor.fetchall():
                try:
                    results[row["key"]] = json.loads(row["value"])
                except Exception:
                    results[row["key"]] = row["value"]
        return results

    def save_all_settings(self, settings_dict: Dict[str, Any]):
        """Persist a dictionary of settings in a single transaction."""
        now = time.time()
        with self.get_connection() as conn:
            cursor = conn.cursor()
            for k, v in settings_dict.items():
                cursor.execute(
                    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);",
                    (k, json.dumps(v), now),
                )

    # ==========================================
    # Queue History Operations
    # ==========================================

    def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieve queue history ordered by creation time descending."""
        results = []
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM queue_history ORDER BY created_at DESC LIMIT ?;",
                (limit,),
            )
            for row in cursor.fetchall():
                artists = []
                if row["artists"]:
                    try:
                        artists = json.loads(row["artists"])
                    except Exception:
                        artists = [row["artists"]]

                results.append({
                    "id": row["id"],
                    "video_id": row["video_id"],
                    "title": row["title"],
                    "artists": artists,
                    "album": row["album"],
                    "year": row["year"],
                    "genre": row["genre"],
                    "thumbnail_url": row["thumbnail_url"],
                    "pos": row["pos"],
                    "timestamp": row["timestamp"],
                    "status": row["status"],
                    "created_at": row["created_at"],
                })
        return results

    def add_history_entry(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Insert or replace a queue history entry."""
        item_id = str(item.get("id") or f"{int(time.time() * 1000)}-{item.get('video_id')}")
        artists_json = json.dumps(item.get("artists") or [])
        now = time.time()

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO queue_history
                (id, video_id, title, artists, album, year, genre, thumbnail_url, pos, timestamp, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    item_id,
                    item.get("video_id", ""),
                    item.get("title", "Unknown"),
                    artists_json,
                    item.get("album", ""),
                    str(item.get("year", "") or ""),
                    str(item.get("genre", "Pop") or "Pop"),
                    item.get("thumbnail_url", ""),
                    int(item.get("pos", -1)),
                    str(item.get("timestamp", "")),
                    str(item.get("status", "success")),
                    float(item.get("created_at") or now),
                ),
            )
        item["id"] = item_id
        return item

    def clear_history(self) -> bool:
        """Truncate all history entries."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM queue_history;")
        return True

    # ==========================================
    # Playlist Sets Operations (Caster Presets)
    # ==========================================

    def get_all_sets(self) -> List[Dict[str, Any]]:
        """Retrieve all playlist sets with track counts."""
        sets = []
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.*, COUNT(i.id) as track_count
                FROM playlist_sets s
                LEFT JOIN playlist_set_items i ON s.id = i.set_id
                GROUP BY s.id
                ORDER BY s.updated_at DESC;
            """)
            for row in cursor.fetchall():
                sets.append({
                    "id": row["id"],
                    "name": row["name"],
                    "description": row["description"] or "",
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "track_count": row["track_count"],
                })
        return sets

    def get_set_details(self, set_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific playlist set and all its tracks in order."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM playlist_sets WHERE id = ?;", (set_id,))
            s_row = cursor.fetchone()
            if not s_row:
                return None

            cursor.execute(
                "SELECT * FROM playlist_set_items WHERE set_id = ? ORDER BY order_index ASC;",
                (set_id,),
            )
            items = []
            for i_row in cursor.fetchall():
                artists = []
                if i_row["artists"]:
                    try:
                        artists = json.loads(i_row["artists"])
                    except Exception:
                        artists = [i_row["artists"]]

                items.append({
                    "id": i_row["id"],
                    "set_id": i_row["set_id"],
                    "video_id": i_row["video_id"],
                    "title": i_row["title"],
                    "artists": artists,
                    "album": i_row["album"],
                    "year": i_row["year"],
                    "genre": i_row["genre"],
                    "thumbnail_url": i_row["thumbnail_url"],
                    "duration_seconds": i_row["duration_seconds"],
                    "duration_formatted": i_row["duration_formatted"],
                    "order_index": i_row["order_index"],
                })

            return {
                "id": s_row["id"],
                "name": s_row["name"],
                "description": s_row["description"] or "",
                "created_at": s_row["created_at"],
                "updated_at": s_row["updated_at"],
                "tracks": items,
            }

    def create_set(self, name: str, description: str = "") -> Dict[str, Any]:
        """Create a new playlist set."""
        set_id = f"set_{int(time.time() * 1000)}"
        now = time.time()
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO playlist_sets (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?);",
                (set_id, name.strip(), description.strip(), now, now),
            )
        return {
            "id": set_id,
            "name": name.strip(),
            "description": description.strip(),
            "created_at": now,
            "updated_at": now,
            "track_count": 0,
        }

    def delete_set(self, set_id: str) -> bool:
        """Delete a playlist set and its items (via CASCADE)."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM playlist_sets WHERE id = ?;", (set_id,))
        return True

    def add_track_to_set(self, set_id: str, track: Dict[str, Any]) -> Dict[str, Any]:
        """Add a track to a playlist set at the end."""
        item_id = f"item_{int(time.time() * 1000)}_{track.get('video_id', '')[:6]}"
        artists_json = json.dumps(track.get("artists") or [])

        with self.get_connection() as conn:
            cursor = conn.cursor()
            # Determine next order index
            cursor.execute(
                "SELECT COALESCE(MAX(order_index), -1) + 1 FROM playlist_set_items WHERE set_id = ?;",
                (set_id,),
            )
            next_idx = cursor.fetchone()[0]

            cursor.execute(
                """
                INSERT INTO playlist_set_items
                (id, set_id, video_id, title, artists, album, year, genre, thumbnail_url, duration_seconds, duration_formatted, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    item_id,
                    set_id,
                    track.get("video_id", ""),
                    track.get("title", "Unknown"),
                    artists_json,
                    track.get("album", ""),
                    str(track.get("year", "") or ""),
                    str(track.get("genre", "Pop") or "Pop"),
                    track.get("thumbnail_url", ""),
                    int(track.get("duration_seconds", 0) or 0),
                    str(track.get("duration_formatted", "00:00")),
                    next_idx,
                ),
            )
            # Update set's updated_at timestamp
            cursor.execute("UPDATE playlist_sets SET updated_at = ? WHERE id = ?;", (time.time(), set_id))

        return {"id": item_id, "set_id": set_id, "order_index": next_idx}

    def remove_track_from_set(self, set_id: str, item_id: str) -> bool:
        """Remove a track from a playlist set."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM playlist_set_items WHERE set_id = ? AND id = ?;",
                (set_id, item_id),
            )
            cursor.execute("UPDATE playlist_sets SET updated_at = ? WHERE id = ?;", (time.time(), set_id))
        return True

    def clear_set_tracks(self, set_id: str) -> bool:
        """Remove all tracks from a playlist set."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM playlist_set_items WHERE set_id = ?;", (set_id,))
            cursor.execute("UPDATE playlist_sets SET updated_at = ? WHERE id = ?;", (time.time(), set_id))
        return True

    def reorder_set_tracks(self, set_id: str, item_ids: List[str]) -> bool:
        """Update order_index of tracks inside a playlist set."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            for idx, item_id in enumerate(item_ids):
                cursor.execute(
                    "UPDATE playlist_set_items SET order_index = ? WHERE set_id = ? AND id = ?;",
                    (idx, set_id, item_id),
                )
            cursor.execute("UPDATE playlist_sets SET updated_at = ? WHERE id = ?;", (time.time(), set_id))
        return True

    # ==========================================
    # Cached Tracks & DJ Play Count Operations
    # ==========================================

    def record_track_play(
        self,
        video_id: str,
        title: str,
        artist: str = "",
        album: str = "",
        thumbnail_url: str = "",
        year: str = "",
        genre: str = "",
        duration_seconds: int = 0,
        duration_formatted: str = "00:00",
    ) -> Dict[str, Any]:
        """
        Increment the play count for a track and update its last_played_at timestamp.
        Inserts a new record if track is not yet tracked.
        """
        now = time.time()
        clean_id = video_id.replace(".mp3", "").strip()
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM cached_tracks WHERE video_id = ?;", (clean_id,))
            row = cursor.fetchone()
            if row:
                new_count = (row["play_count"] or 0) + 1
                cursor.execute(
                    """
                    UPDATE cached_tracks 
                    SET play_count = ?, last_played_at = ?, updated_at = ?,
                        title = COALESCE(NULLIF(?, ''), title),
                        artist = COALESCE(NULLIF(?, ''), artist),
                        album = COALESCE(NULLIF(?, ''), album),
                        thumbnail_url = COALESCE(NULLIF(?, ''), thumbnail_url)
                    WHERE video_id = ?;
                    """,
                    (new_count, now, now, title, artist, album, thumbnail_url, clean_id),
                )
            else:
                new_count = 1
                cursor.execute(
                    """
                    INSERT INTO cached_tracks
                    (video_id, title, artist, album, year, genre, thumbnail_url, duration_seconds, duration_formatted, play_count, last_played_at, is_cached, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
                    """,
                    (
                        clean_id,
                        title or "Unknown",
                        artist or "",
                        album or "",
                        year or "",
                        genre or "",
                        thumbnail_url or "",
                        duration_seconds or 0,
                        duration_formatted or "00:00",
                        1,
                        now,
                        now,
                        now,
                    ),
                )
        return {"video_id": clean_id, "play_count": new_count, "last_played_at": now}

    def register_cached_file(
        self,
        video_id: str,
        file_path: str,
        file_size_bytes: int,
        title: str,
        artist: str = "",
        album: str = "",
        thumbnail_url: str = "",
        year: str = "",
        genre: str = "",
        duration_seconds: int = 0,
        duration_formatted: str = "00:00",
    ) -> Dict[str, Any]:
        """
        Register a file into cached_tracks as physically stored on disk (is_cached = 1).
        Preserves existing play_count and last_played_at.
        """
        now = time.time()
        clean_id = video_id.replace(".mp3", "").strip()
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM cached_tracks WHERE video_id = ?;", (clean_id,))
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    """
                    UPDATE cached_tracks
                    SET file_path = ?, file_size_bytes = ?, is_cached = 1, updated_at = ?,
                        title = COALESCE(NULLIF(?, ''), title),
                        artist = COALESCE(NULLIF(?, ''), artist),
                        album = COALESCE(NULLIF(?, ''), album),
                        thumbnail_url = COALESCE(NULLIF(?, ''), thumbnail_url),
                        year = COALESCE(NULLIF(?, ''), year),
                        genre = COALESCE(NULLIF(?, ''), genre)
                    WHERE video_id = ?;
                    """,
                    (file_path, file_size_bytes, now, title, artist, album, thumbnail_url, year, genre, clean_id),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO cached_tracks
                    (video_id, title, artist, album, year, genre, file_path, thumbnail_url, duration_seconds, duration_formatted, file_size_bytes, play_count, last_played_at, is_cached, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 1, ?, ?);
                    """,
                    (
                        clean_id,
                        title or "Unknown",
                        artist or "",
                        album or "",
                        year or "",
                        genre or "",
                        file_path,
                        thumbnail_url or "",
                        duration_seconds or 0,
                        duration_formatted or "00:00",
                        file_size_bytes,
                        now,
                        now,
                    ),
                )
        return {"video_id": clean_id, "file_path": file_path, "is_cached": True}

    def mark_cache_cleared(self, video_ids: Optional[List[str]] = None):
        """Mark tracks as not cached when files are deleted from disk."""
        now = time.time()
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if video_ids:
                placeholders = ",".join("?" for _ in video_ids)
                cursor.execute(
                    f"UPDATE cached_tracks SET is_cached = 0, file_path = '', file_size_bytes = 0, updated_at = ? WHERE video_id IN ({placeholders});",
                    [now] + video_ids,
                )
            else:
                cursor.execute(
                    "UPDATE cached_tracks SET is_cached = 0, file_path = '', file_size_bytes = 0, updated_at = ?;",
                    (now,),
                )

    def get_cached_tracks(
        self,
        search: str = "",
        only_cached: bool = False,
        sort_by: str = "play_count",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Retrieve tracks with play counts and cache status."""
        query = "SELECT * FROM cached_tracks WHERE 1=1"
        params: List[Any] = []

        if only_cached:
            query += " AND is_cached = 1"

        if search and search.strip():
            q = f"%{search.strip().lower()}%"
            query += " AND (LOWER(title) LIKE ? OR LOWER(artist) LIKE ?)"
            params.extend([q, q])

        if sort_by == "play_count":
            query += " ORDER BY play_count DESC, last_played_at DESC"
        elif sort_by == "recent":
            query += " ORDER BY last_played_at DESC"
        elif sort_by == "title":
            query += " ORDER BY title ASC"
        else:
            query += " ORDER BY updated_at DESC"

        query += " LIMIT ?;"
        params.append(limit)

        results = []
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            for row in cursor.fetchall():
                results.append(dict(row))
        return results

    def get_dj_top_chart(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Rank songs based on DJ play count and rotation frequency.
        Assigns ranks (#1, #2...) and rotation weight badges.
        """
        chart = []
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM cached_tracks 
                WHERE play_count > 0 
                ORDER BY play_count DESC, last_played_at DESC 
                LIMIT ?;
                """,
                (limit,),
            )
            rows = cursor.fetchall()
            for idx, row in enumerate(rows, start=1):
                item = dict(row)
                item["rank"] = idx
                if idx <= 3:
                    item["rotation_status"] = "heavy"
                elif idx <= 10:
                    item["rotation_status"] = "medium"
                else:
                    item["rotation_status"] = "light"
                chart.append(item)
        return chart

    def get_dj_top_artists(self, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Calculate the DJ's most played artists based on cumulative play counts.
        """
        artists = []
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT artist, SUM(play_count) as total_plays, COUNT(*) as track_count
                FROM cached_tracks
                WHERE artist IS NOT NULL AND TRIM(artist) != '' AND artist != 'YouTube Music'
                GROUP BY artist
                ORDER BY total_plays DESC
                LIMIT ?;
                """,
                (limit,),
            )
            for row in cursor.fetchall():
                artists.append({
                    "artist": row["artist"],
                    "play_count": row["total_plays"],
                    "track_count": row["track_count"],
                })
        return artists

    def get_dj_rotation_candidates(
        self,
        min_plays: int = 1,
        cooldown_seconds: int = 5400,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Find DJ signature songs ready to be rotated back into broadcast airplay.
        A track is a rotation candidate if:
        - It has been played before (play_count >= min_plays).
        - It has NOT been played within the cooldown window (e.g., 90 minutes).
        Ranked by: play_count * time_since_last_play (highest rotation readiness).
        """
        now = time.time()
        cutoff = now - cooldown_seconds
        candidates = []
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM cached_tracks
                WHERE play_count >= ? AND (last_played_at IS NULL OR last_played_at <= ?)
                ORDER BY play_count DESC, last_played_at ASC
                LIMIT ?;
                """,
                (min_plays, cutoff, limit),
            )
            for row in cursor.fetchall():
                candidates.append(dict(row))
        return candidates

    # ==========================================
    # Storage Directory Relocation
    # ==========================================

    def relocate_storage(self, new_dir_str: str) -> bool:
        """
        Move or point the database to a new directory (e.g. D:/RadioBOSS-Data).
        Copies the current database to the new destination if it doesn't already exist.
        """
        if not new_dir_str or not new_dir_str.strip():
            # Reset to default
            default_dir = _get_default_storage_dir()
            pointer_file = default_dir / "storage_location.txt"
            if pointer_file.is_file():
                try:
                    pointer_file.unlink()
                except Exception:
                    pass
            self.storage_dir = default_dir
            self.db_path = default_dir / "radioboss_caster.db"
            logger.info("Storage location reset to default %APPDATA%/RadioBOSSCaster")
            return True

        new_dir = Path(new_dir_str.strip())
        try:
            new_dir.mkdir(parents=True, exist_ok=True)
            new_db_path = new_dir / "radioboss_caster.db"

            # If current db exists and target does not exist, copy it over
            if self.db_path.is_file() and not new_db_path.is_file():
                import shutil
                shutil.copy2(str(self.db_path), str(new_db_path))
                logger.info(f"Copied existing database from {self.db_path} to {new_db_path}")

            # Update pointer file in default dir
            default_dir = _get_default_storage_dir()
            pointer_file = default_dir / "storage_location.txt"
            pointer_file.write_text(str(new_dir), encoding="utf-8")

            # Point active instance to new location
            self.storage_dir = new_dir
            self.db_path = new_db_path
            self._init_database()
            logger.info(f"Successfully relocated storage to: {new_dir}")
            return True
        except Exception as e:
            logger.error(f"Failed to relocate storage to {new_dir_str}: {e}")
            return False


# Singleton database service
db_service = DatabaseService()
