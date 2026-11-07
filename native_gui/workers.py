"""Background Qt Worker Threads for Non-Blocking Studio Operations."""
import asyncio
import os
import sys
import logging
from typing import List, Dict, Any, Optional

from PySide6.QtCore import QThread, Signal

# Add backend directory to path if not already present
sys_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if sys_path not in sys.path:
    sys.path.insert(0, sys_path)

from app.services.radioboss_service import radioboss_service
from app.services.ytmusic_service import ytmusic_service
from app.services.ytdlp_service import ytdlp_service
from app.services.cache_service import cache_service
from app.services.settings_service import settings_service
from app.services.history_service import history_service
from app.services.db_service import db_service
from app.services.telemetry_service import telemetry_service

logger = logging.getLogger(__name__)


def _track_to_dict(track) -> Dict[str, Any]:
    """Convert TrackItem or raw dict into unified dict for UI consumption."""
    if hasattr(track, "model_dump"):
        d = track.model_dump()
    elif isinstance(track, dict):
        d = dict(track)
    else:
        d = {}

    # Ensure standard keys
    video_id = d.get("video_id") or d.get("id") or ""
    title = d.get("title") or "Unknown Title"
    artists = d.get("artists") or []
    if isinstance(artists, str):
        artists = [artists]
    album = d.get("album") or "Single"
    duration = d.get("duration_formatted") or d.get("duration") or "00:00"
    thumbnail_url = d.get("thumbnail_url")
    year = str(d.get("year") or "").strip()
    genre = d.get("genre") or "Pop"

    return {
        "video_id": video_id,
        "title": title,
        "artists": artists,
        "album": album,
        "duration": duration,
        "duration_formatted": duration,
        "thumbnail_url": thumbnail_url,
        "year": year,
        "genre": genre,
    }


class SearchWorker(QThread):
    """Asynchronous worker for searching YouTube Music or resolving pasted URLs."""
    finished = Signal(list)  # list of track dicts
    error = Signal(str)

    def __init__(self, query: str):
        super().__init__()
        self.query = query.strip()

    def run(self):
        try:
            if not self.query:
                self.finished.emit([])
                return

            # Check if query is a direct YouTube URL
            if "youtube.com" in self.query or "youtu.be" in self.query or "music.youtube.com" in self.query:
                track_item, _ = ytdlp_service.extract_track_info(self.query)
                if track_item:
                    self.finished.emit([_track_to_dict(track_item)])
                    return
                else:
                    self.finished.emit([])
                    return

            # Standard search via official YT Music catalog
            results = ytmusic_service.search_songs(self.query, limit=25)
            dict_results = [_track_to_dict(t) for t in results]
            self.finished.emit(dict_results)
        except Exception as e:
            logger.error(f"SearchWorker failed: {e}")
            self.error.emit(str(e))


class RecommendationsWorker(QThread):
    """Asynchronous worker for fetching radio recommendations (Up Next or Mood)."""
    finished = Signal(list)
    error = Signal(str)

    def __init__(self, category_or_id: str = "mood:Semangat Pagi"):
        super().__init__()
        self.category_or_id = category_or_id

    def run(self):
        try:
            if self.category_or_id.startswith("mood:"):
                mood_name = self.category_or_id.split("mood:", 1)[1]
                tracks = ytmusic_service.search_songs(mood_name, limit=20)
                dict_results = [_track_to_dict(t) for t in tracks]
                self.finished.emit(dict_results)
            elif self.category_or_id.startswith("casterhub:"):
                chart_category = self.category_or_id.split("casterhub:", 1)[1]
                tracks = asyncio.run(telemetry_service.get_global_charts(category=chart_category, limit=30))
                self.finished.emit(tracks)
            else:
                # Video ID for Up Next recommendations
                clean_id = self.category_or_id.strip()
                recs = ytmusic_service.get_recommendations(clean_id, limit=20)
                dict_results = [_track_to_dict(t) for t in recs]
                self.finished.emit(dict_results)
        except Exception as e:
            logger.error(f"RecommendationsWorker failed: {e}")
            self.error.emit(str(e))


class RadioBossSyncWorker(QThread):
    """Background loop to periodically sync RadioBOSS On-Air status, tabs, and queue."""
    status_updated = Signal(object)      # RadioBOSSStatusResponse
    playlist_updated = Signal(list, str) # tracks, message
    tabs_updated = Signal(list, str, int, bool) # available_tabs, active_tab, active_idx, is_synced

    def __init__(self, target_tab: str = ""):
        super().__init__()
        self.target_tab = target_tab

    def run(self):
        async def _sync_all():
            # 1. Status & Playback info
            status = await radioboss_service.check_status()
            self.status_updated.emit(status)

            # 2. Tabs info
            try:
                tabs, active_tab, active_idx, is_synced = await radioboss_service.get_tabs_info()
                self.tabs_updated.emit(tabs, active_tab, active_idx, is_synced)
            except Exception as e:
                logger.debug(f"Error querying tabs: {e}")

            # 3. Upcoming Playlist Queue
            try:
                ok, tracks, msg = await radioboss_service.get_playlist(limit=50)
                self.playlist_updated.emit(tracks if ok else [], msg)
            except Exception as e:
                logger.debug(f"Error querying playlist: {e}")

            # 4. Background Sync Telemetry Outbox & Airtime to CasterHub
            try:
                await telemetry_service.sync_outbox_to_casterhub()
            except Exception as e:
                logger.debug(f"Background telemetry sync exception: {e}")

        try:
            asyncio.run(_sync_all())
        except Exception as e:
            logger.debug(f"RadioBossSyncWorker cycle exception: {e}")


class QueueWorker(QThread):
    """Asynchronous worker for queuing a song into RadioBOSS."""
    started_task = Signal(str)
    success = Signal(str, str) # action_label, full_title
    error = Signal(str)

    def __init__(
        self,
        video_id: str,
        song_title: str,
        artist: str,
        album: str = "",
        thumbnail_url: str = "",
        pos: int = -1,
        target_tab: str = "",
        year: str = "",
        genre: str = "",
    ):
        super().__init__()
        self.video_id = video_id
        self.song_title = song_title
        self.artist = artist
        self.album = album
        self.thumbnail_url = thumbnail_url
        self.pos = pos
        self.target_tab = target_tab
        self.year = year
        self.genre = genre

    def run(self):
        async def _execute():
            clean_id = self.video_id.strip()
            self.started_task.emit(f"Memproses '{self.artist} - {self.song_title}'...")

            # Prepare studio master MP3 with ID3 tags & Artwork in background thread
            cached_file = None
            try:
                cached_file = await asyncio.to_thread(
                    cache_service.prepare_studio_cache,
                    clean_id,
                    self.song_title,
                    self.artist,
                    self.album,
                    self.thumbnail_url,
                    self.year,
                    self.genre,
                )
            except Exception as e:
                logger.warning(f"Studio master cache generation failed: {e}")

            is_local_rb = radioboss_service.is_local_instance()

            if is_local_rb and cached_file and os.path.isfile(cached_file):
                target_filename = cached_file
            else:
                # Direct stream extraction fallback
                stream_url, _ = await asyncio.to_thread(ytdlp_service.get_live_stream_details, clean_id)
                if not stream_url:
                    self.error.emit(f"Gagal mengekstrak audio untuk '{self.artist} - {self.song_title}'.")
                    return
                target_filename = stream_url

            # Title formatting
            streaming_title = settings_service.format_title(artist=self.artist, title=self.song_title)
            display_title = f"{self.artist} - {self.song_title}" if self.artist else self.song_title

            # Determine position
            target_pos = self.pos
            if self.pos in (1, -2):
                try:
                    rb_status = await radioboss_service.check_status()
                    current_status = (
                        (rb_status.now_playing.status or "").strip().lower()
                        if (rb_status.connected and rb_status.now_playing)
                        else ""
                    )
                    is_playing = current_status in ("play", "playing", "pause", "paused")
                    target_pos = -2 if is_playing else 1
                except Exception:
                    target_pos = -2

            # Switch tab if requested
            if self.target_tab and self.target_tab.strip().lower() not in ("auto", "aktif", "auto / aktif"):
                try:
                    await radioboss_service.switch_playlist_tab(self.target_tab.strip())
                    await asyncio.sleep(0.08)
                except Exception as e:
                    logger.warning(f"Could not switch tab to '{self.target_tab}': {e}")

            # Insert into RadioBOSS
            ok, msg = await radioboss_service.insert_track(
                filename=target_filename,
                pos=target_pos,
                title=streaming_title or display_title,
            )

            if not ok:
                self.error.emit(msg)
                return

            action_label = "Putar Berikutnya" if target_pos == -2 else "Antrean Bawah"

            # Save to persistent history
            try:
                import datetime, time
                history_entry = {
                    "id": f"{int(time.time() * 1000)}-{clean_id}",
                    "video_id": clean_id,
                    "title": display_title,
                    "artists": [self.artist] if self.artist else [],
                    "thumbnail_url": self.thumbnail_url,
                    "pos": target_pos,
                    "timestamp": datetime.datetime.now().strftime("%H:%M"),
                    "status": "success",
                }
                history_service.add_item(history_entry)
            except Exception as e:
                logger.debug(f"Could not append history: {e}")

            # Record track play count in SQLite database
            try:
                db_service.record_track_play(
                    video_id=clean_id,
                    title=self.song_title,
                    artist=self.artist,
                    album=self.album,
                    thumbnail_url=self.thumbnail_url,
                    year=self.year,
                    genre=self.genre,
                )
            except Exception as e:
                logger.debug(f"Could not record SQLite play count: {e}")

            # Enqueue to CasterHub anonymous telemetry outbox
            try:
                is_cached = bool(cached_file and os.path.isfile(cached_file))
                file_sz = os.path.getsize(cached_file) if is_cached else 0
                telemetry_service.enqueue_airplay_event(
                    video_id=clean_id,
                    title=self.song_title,
                    artist=self.artist,
                    album=self.album,
                    genre=self.genre or "Pop",
                    thumbnail_url=self.thumbnail_url,
                    duration_seconds=180,
                    duration_formatted="03:00",
                    action_type="queue_next" if target_pos == -2 else "queue_bottom",
                    is_from_cache=is_cached,
                    file_size_bytes=file_sz,
                )
            except Exception as e:
                logger.debug(f"Could not enqueue telemetry: {e}")

            self.success.emit(action_label, display_title)

        try:
            asyncio.run(_execute())
        except Exception as e:
            logger.error(f"QueueWorker error: {e}")
            self.error.emit(str(e))


class TransportWorker(QThread):
    """Asynchronous worker for remote transport commands (Play, Pause, Skip, Stop)."""
    finished = Signal(bool, str)

    def __init__(self, action: str):
        super().__init__()
        self.action = action

    def run(self):
        async def _send():
            return await radioboss_service.send_playback_command(self.action)

        try:
            ok, msg = asyncio.run(_send())
            self.finished.emit(ok, msg)
        except Exception as e:
            self.finished.emit(False, str(e))
