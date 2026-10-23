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
