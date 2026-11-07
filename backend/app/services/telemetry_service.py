"""Telemetry & Air-Time Service: Manages broadcaster air-time, anonymous telemetry outbox, and CasterHub charts sync."""
import hashlib
import json
import logging
import os
import platform
import subprocess
import time
from typing import Dict, Any, List, Optional
import httpx

from app.services.db_service import db_service
from app.services.settings_service import settings_service

logger = logging.getLogger(__name__)


def _get_machine_hash() -> str:
    """Generate deterministic, irreversible anonymous station hash (Zero-PII)."""
    raw_ident = ""
    if platform.system() == "Windows":
        try:
            # Query machine GUID from registry
            output = subprocess.check_output(
                'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
                shell=True,
                text=True,
                stderr=subprocess.DEVNULL,
            )
            for line in output.splitlines():
                if "MachineGuid" in line:
                    raw_ident = line.split()[-1].strip()
                    break
        except Exception:
            pass

    if not raw_ident:
        raw_ident = f"{platform.node()}-{os.getlogin() if hasattr(os, 'getlogin') else 'caster'}"

    # One-way SHA-256 with static CasterHub salt
    salted = f"CasterHub::Salt::2026::{raw_ident}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


class TelemetryService:
    """Broadcaster Air-Time & CasterHub Central Telemetry Manager."""

    def __init__(self):
        self.station_hash = _get_machine_hash()
        self.session_start_time = time.time()
        self.last_airtime_sync = time.time()
        self.session_songs_dispatched = 0
        self.session_cache_saved_bytes = 0

    def get_time_belt(self) -> str:
        """Determine time-belt category from local studio hour."""
        hour = time.localtime().tm_hour
        if 5 <= hour < 10:
            return "morning"
        elif 10 <= hour < 18:
            return "afternoon"
        else:
            return "night"

    def record_airtime_tick(self, delta_seconds: int = 60) -> int:
        """Increment lifetime airtime and save to settings."""
        cfg = settings_service.get_config()
        current_total = cfg.total_airtime_seconds or 0
        new_total = current_total + delta_seconds
        cfg.total_airtime_seconds = new_total
        settings_service.update_config(cfg)
        return new_total

    def get_session_stats(self) -> Dict[str, Any]:
        """Return broadcaster shift / session metrics for today."""
        now = time.time()
        session_duration_sec = int(now - self.session_start_time)
        cfg = settings_service.get_config()
        lifetime_hours = (cfg.total_airtime_seconds or 0) / 3600.0

        # Query songs dispatched today from queue_history
        today_midnight = time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d"))
        songs_today = 0
        try:
            with db_service.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT COUNT(*) FROM queue_history WHERE created_at >= ?;",
                    (today_midnight,),
                )
                songs_today = cursor.fetchone()[0]
        except Exception as e:
            logger.debug(f"Could not query songs today: {e}")

        m, s = divmod(session_duration_sec, 60)
        h, m = divmod(m, 60)

        return {
            "session_time_formatted": f"{h:02d}j {m:02d}m",
            "session_seconds": session_duration_sec,
            "lifetime_airtime_hours": round(lifetime_hours, 1),
            "songs_today": songs_today,
            "session_songs_dispatched": self.session_songs_dispatched,
            "session_cache_saved_mb": round(self.session_cache_saved_bytes / (1024 * 1024), 1),
            "station_hash_short": self.station_hash[:8],
        }

    def enqueue_airplay_event(
        self,
        video_id: str,
        title: str,
        artist: str = "",
        album: str = "",
        genre: str = "Pop",
        thumbnail_url: str = "",
        duration_seconds: int = 0,
        duration_formatted: str = "00:00",
        action_type: str = "queue_bottom",
        is_from_cache: bool = False,
        file_size_bytes: int = 0,
    ):
        """Enqueue song play event into local SQLite outbox."""
        self.session_songs_dispatched += 1
        if is_from_cache and file_size_bytes > 0:
            self.session_cache_saved_bytes += file_size_bytes

        cfg = settings_service.get_config()
        if not cfg.enable_telemetry:
            return  # User opted out of anonymous telemetry

        now = time.time()
        event_id = f"evt_{int(now * 1000)}_{video_id[:6]}"
        time_belt = self.get_time_belt()

        try:
            with db_service.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO telemetry_outbox
                    (id, video_id, title, artist, album, genre, thumbnail_url, duration_seconds, duration_formatted, action_type, time_belt, timestamp, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        event_id,
                        video_id,
                        title,
                        artist,
                        album,
                        genre or "Pop",
                        thumbnail_url,
                        duration_seconds,
                        duration_formatted,
                        action_type,
                        time_belt,
                        now,
                        now,
                    ),
                )
        except Exception as e:
            logger.warning(f"Failed to queue telemetry event: {e}")

    async def sync_outbox_to_casterhub(self) -> bool:
        """Send pending outbox events & air-time delta to CasterHub server."""
        cfg = settings_service.get_config()
        if not cfg.enable_telemetry:
            return False

        hub_url = (cfg.casterhub_url or "http://localhost:3000").rstrip("/")
        endpoint = f"{hub_url}/api/v1/telemetry/sync"

        # Calculate air-time delta since last sync
        now = time.time()
        delta_airtime = int(now - self.last_airtime_sync)
        if delta_airtime >= 60:
            self.record_airtime_tick(delta_airtime)
            self.last_airtime_sync = now

        # Fetch up to 25 pending events from SQLite outbox
        pending_rows = []
        try:
            with db_service.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM telemetry_outbox ORDER BY created_at ASC LIMIT 25;")
                pending_rows = [dict(r) for r in cursor.fetchall()]
        except Exception as e:
            logger.debug(f"Could not read outbox: {e}")
            return False

        events_payload = []
        for r in pending_rows:
            events_payload.append({
                "video_id": r["video_id"],
                "title": r["title"],
                "artist": r["artist"] or "",
                "album": r["album"] or "",
                "genre": r["genre"] or "Pop",
                "thumbnail_url": r["thumbnail_url"] or "",
                "duration_seconds": r["duration_seconds"] or 0,
                "duration_formatted": r["duration_formatted"] or "00:00",
                "action_type": r["action_type"] or "queue_bottom",
                "time_belt": r["time_belt"] or "morning",
                "timestamp": r["timestamp"],
            })

        payload = {
            "station_hash": self.station_hash,
            "app_version": "1.0.0",
            "airtime_delta_seconds": delta_airtime,
            "cache_saved_bytes": self.session_cache_saved_bytes,
            "events": events_payload,
        }

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(endpoint, json=payload)
                if resp.status_code == 200:
                    # Clear synced events from SQLite outbox
                    if pending_rows:
                        ids = [r["id"] for r in pending_rows]
                        placeholders = ",".join("?" for _ in ids)
                        with db_service.get_connection() as conn:
                            cursor = conn.cursor()
                            cursor.execute(
                                f"DELETE FROM telemetry_outbox WHERE id IN ({placeholders});",
                                ids,
                            )
                    return True
        except Exception as e:
            logger.debug(f"CasterHub sync offline or unreachable: {e}")

        return False

    async def get_global_charts(self, category: str = "top50", limit: int = 25) -> List[Dict[str, Any]]:
        """Fetch global radio charts from CasterHub with local SQLite caching."""
        cfg = settings_service.get_config()
        hub_url = (cfg.casterhub_url or "http://localhost:3000").rstrip("/")
        endpoint = f"{hub_url}/api/v1/charts?category={category}&limit={limit}"

        # 1. Try remote fetch
        try:
            async with httpx.AsyncClient(timeout=3.5) as client:
                resp = await client.get(endpoint)
                if resp.status_code == 200:
                    data = resp.json()
                    tracks = data.get("tracks", [])
                    # Cache to SQLite
                    with db_service.get_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute(
                            "INSERT OR REPLACE INTO global_charts_cache (category, data_json, updated_at) VALUES (?, ?, ?);",
                            (category, json.dumps(tracks), time.time()),
                        )
                    return tracks
        except Exception as e:
            logger.debug(f"Failed to fetch remote charts ({e}), falling back to local cache.")

        # 2. Fallback to local SQLite cache
        try:
            with db_service.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT data_json FROM global_charts_cache WHERE category = ?;", (category,))
                row = cursor.fetchone()
                if row:
                    return json.loads(row["data_json"])
        except Exception as e:
            logger.debug(f"Could not load local charts cache: {e}")

        # 3. Smart local DJ top chart fallback if no network yet
        try:
            local_chart = db_service.get_dj_top_chart(limit=limit)
            return [
                {
                    "rank": idx + 1,
                    "video_id": r["video_id"],
                    "title": r["title"],
                    "artist": r.get("artist") or "Unknown Artist",
                    "album": r.get("album") or "Single",
                    "genre": r.get("genre") or "Pop",
                    "duration_formatted": r.get("duration_formatted") or "00:00",
                    "total_plays": r.get("play_count") or 1,
                    "unique_stations": 1,
                    "movement": "LOCAL",
                }
                for idx, r in enumerate(local_chart)
            ]
        except Exception:
            return []

    async def get_network_pulse(self) -> Dict[str, Any]:
        """Fetch network stats and live on-air ticker from CasterHub."""
        cfg = settings_service.get_config()
        hub_url = (cfg.casterhub_url or "http://localhost:3000").rstrip("/")
        endpoint = f"{hub_url}/api/v1/network-stats"

        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                resp = await client.get(endpoint)
                if resp.status_code == 200:
                    return resp.json()
        except Exception:
            pass

        return {
            "success": True,
            "stats": {
                "active_stations_online": 1,
                "total_airtime_hours": round((cfg.total_airtime_seconds or 0) / 3600.0, 1),
                "total_songs_dispatched": self.session_songs_dispatched,
            },
            "live_ticker": [],
        }


# Singleton service
telemetry_service = TelemetryService()
