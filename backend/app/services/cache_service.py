"""Studio Master Cache Service: Pre-caches studio audio files with full ID3v2 tags and cover art for RadioBOSS."""
import logging
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from typing import Optional
from app.services.ytdlp_service import ytdlp_service
from app.services.settings_service import settings_service

logger = logging.getLogger(__name__)


def _find_ffmpeg_binary() -> str:
    """Find ffmpeg binary in executable dir, local dist, system paths, or PATH."""
    bin_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    candidates = []
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        candidates.append(os.path.join(exe_dir, bin_name))
        if hasattr(sys, "_MEIPASS"):
            candidates.append(os.path.join(sys._MEIPASS, bin_name))

    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    candidates.extend([
        os.path.join(project_root, "dist", bin_name),
        os.path.join(os.getcwd(), "dist", bin_name),
        os.path.join(os.getcwd(), bin_name),
        r"D:\Apps\ffmpeg\bin\ffmpeg.exe",
        "/usr/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/snap/bin/ffmpeg",
    ])

    for c in candidates:
        if os.path.isfile(c):
            return os.path.abspath(c)

    which = shutil.which("ffmpeg")
    return which or bin_name


class CacheService:
    """Manages local broadcast audio cache with rich ID3v2 metadata and artwork."""

    def __init__(self):
        pass

    @property
    def cache_dir(self) -> str:
        """Resolve effective audio cache directory (custom, custom_data_dir/cache, or %APPDATA%/RadioBOSSCaster/cache)."""
        try:
            cfg = settings_service.get_config()
            if cfg.custom_cache_dir and cfg.custom_cache_dir.strip():
                target = cfg.custom_cache_dir.strip()
                os.makedirs(target, exist_ok=True)
                return os.path.abspath(target)
            elif cfg.custom_data_dir and cfg.custom_data_dir.strip():
                target = os.path.join(cfg.custom_data_dir.strip(), "cache")
                os.makedirs(target, exist_ok=True)
                return os.path.abspath(target)
        except Exception as e:
            logger.warning(f"Could not use custom cache directory: {e}")

        appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
        default_dir = os.path.join(appdata, "RadioBOSSCaster", "cache")
        try:
            os.makedirs(default_dir, exist_ok=True)
        except Exception:
            pass
        return default_dir

    def get_cache_stats(self) -> dict:
        """Calculate number of cached tracks, total disk usage, limit, and sync with DB."""
        total_files = 0
        total_size = 0
        try:
            self.sync_disk_cache()
            if os.path.isdir(self.cache_dir):
                for entry in os.scandir(self.cache_dir):
                    if entry.is_file():
                        total_files += 1
                        total_size += entry.stat().st_size
        except Exception as e:
            logger.error(f"Error reading cache stats: {e}")

        size_mb = round(total_size / (1024 * 1024), 2)
        cfg = settings_service.get_config()
        max_mb = getattr(cfg, "max_cache_size_mb", 2048)
        auto_cleanup = getattr(cfg, "auto_cleanup_cache", True)
        used_percent = round((size_mb / max_mb) * 100, 1) if max_mb > 0 else 0

        from app.services.db_service import db_service
        return {
            "cache_dir": self.cache_dir,
            "storage_dir": str(db_service.storage_dir),
            "db_path": str(db_service.db_path),
            "total_files": total_files,
            "total_size_bytes": total_size,
            "total_size_mb": size_mb,
            "max_cache_size_mb": max_mb,
            "used_percent": min(used_percent, 100.0),
            "auto_cleanup_cache": auto_cleanup,
        }

    def enforce_cache_limit(self, target_max_mb: Optional[int] = None) -> int:
        """
        Check total cache size against limit. If limit is exceeded, evict files
        starting from least-played tracks and oldest played tracks.
        Returns the number of audio files deleted.
        """
        try:
            cfg = settings_service.get_config()
            limit_mb = target_max_mb if target_max_mb is not None else getattr(cfg, "max_cache_size_mb", 2048)
            if limit_mb is None or limit_mb <= 0:
                return 0  # Unlimited

            limit_bytes = int(limit_mb * 1024 * 1024)
            if not os.path.isdir(self.cache_dir):
                return 0

            # Calculate current total size
            entries = []
            total_size = 0
            for entry in os.scandir(self.cache_dir):
                if entry.is_file():
                    size = entry.stat().st_size
                    entries.append((entry.path, size, entry.stat().st_mtime))
                    total_size += size

            if total_size <= limit_bytes:
                return 0

            # Target 90% of limit to prevent immediate re-trigger
            target_size = int(limit_bytes * 0.90)
            bytes_to_reclaim = total_size - target_size
            freed_bytes = 0
            pruned_count = 0

            from app.services.db_service import db_service
            # Query tracks ordered by least airplay and oldest last_played
            tracked_candidates = []
            try:
                with db_service.get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        """
                        SELECT video_id, file_path, file_size_bytes
                        FROM cached_tracks
                        WHERE is_cached = 1
                        ORDER BY play_count ASC, last_played_at ASC, cached_at ASC;
                        """
                    )
                    tracked_candidates = cursor.fetchall()
            except Exception as e:
                logger.warning(f"Error querying cache candidates from DB: {e}")

            deleted_paths = set()

            # Evict from database tracked files first (LRU / Least Played)
            for row in tracked_candidates:
                if freed_bytes >= bytes_to_reclaim:
                    break
                path = row["file_path"]
                if path and os.path.isfile(path):
                    try:
                        sz = os.path.getsize(path)
                        os.remove(path)
                        freed_bytes += sz
                        pruned_count += 1
                        deleted_paths.add(path)
                        # Also remove sidecar .jpg cover if exists
                        sidecar_jpg = os.path.splitext(path)[0] + ".jpg"
                        if os.path.isfile(sidecar_jpg):
                            try:
                                freed_bytes += os.path.getsize(sidecar_jpg)
                                os.remove(sidecar_jpg)
                            except Exception:
                                pass
                    except Exception as e:
                        logger.debug(f"Could not remove cached file {path}: {e}")

            # If still over limit, evict any remaining files by oldest mtime
            if freed_bytes < bytes_to_reclaim:
                entries.sort(key=lambda x: x[2])  # Sort by mtime ascending (oldest first)
                for path, sz, _ in entries:
                    if freed_bytes >= bytes_to_reclaim:
                        break
                    if path not in deleted_paths and os.path.isfile(path):
                        try:
                            os.remove(path)
                            freed_bytes += sz
                            pruned_count += 1
                            deleted_paths.add(path)
                        except Exception:
                            pass

            if pruned_count > 0:
                logger.info(
                    f"Cache limit enforced: pruned {pruned_count} files freeing "
                    f"{round(freed_bytes / (1024*1024), 2)} MB"
                )
                self.sync_disk_cache()

            return pruned_count

        except Exception as e:
            logger.error(f"Error enforcing cache limit: {e}")
            return 0


    def sync_disk_cache(self):
        """Scan cache directory and register existing MP3s into SQLite cached_tracks table."""
        from app.services.db_service import db_service
        try:
            if not os.path.isdir(self.cache_dir):
                return
            for entry in os.scandir(self.cache_dir):
                if entry.is_file() and entry.name.endswith(".mp3"):
                    file_size = entry.stat().st_size
                    if file_size > 50000:
                        stem = entry.name[:-4]
                        if " - " in stem:
                            parts = stem.split(" - ", 1)
                            artist = parts[0].strip()
                            title = parts[1].strip()
                        else:
                            artist = ""
                            title = stem.strip()

                        vid = stem
                        thumb = ""
                        album = ""
                        year = ""
                        genre = ""
                        try:
                            with db_service.get_connection() as conn:
                                cursor = conn.cursor()
                                cursor.execute(
                                    "SELECT video_id, thumbnail_url, year, genre, album FROM queue_history WHERE title LIKE ? LIMIT 1;",
                                    (f"%{title}%",),
                                )
                                match = cursor.fetchone()
                                if match:
                                    vid = match["video_id"]
                                    thumb = match["thumbnail_url"]
                                    album = match["album"]
                                    year = match["year"]
                                    genre = match["genre"]
                        except Exception:
                            pass

                        db_service.register_cached_file(
                            video_id=vid,
                            file_path=entry.path,
                            file_size_bytes=file_size,
                            title=title,
                            artist=artist,
                            album=album,
                            thumbnail_url=thumb,
                            year=year,
                            genre=genre,
                        )
        except Exception as e:
            logger.warning(f"Error syncing disk cache to DB: {e}")

    def open_cache_folder(self) -> bool:
        """Open the cache directory in Windows File Explorer."""
        try:
            os.makedirs(self.cache_dir, exist_ok=True)
            if sys.platform == "win32":
                os.startfile(self.cache_dir)
                return True
            else:
                import subprocess
                subprocess.Popen(["xdg-open", self.cache_dir])
                return True
        except Exception as e:
            logger.error(f"Failed to open cache folder: {e}")
            return False

    def clear_cache(self, older_than_days: Optional[int] = None) -> int:
        """
        Delete cached audio and temporary files to free disk space.
        If older_than_days is provided, only files not modified in the last N days will be deleted.
        """
        deleted = 0
        cutoff_time = (time.time() - (older_than_days * 86400)) if older_than_days else None
        try:
            if os.path.isdir(self.cache_dir):
                for entry in os.scandir(self.cache_dir):
                    if entry.is_file():
                        try:
                            if cutoff_time is not None:
                                if entry.stat().st_mtime < cutoff_time:
                                    os.remove(entry.path)
                                    deleted += 1
                            else:
                                os.remove(entry.path)
                                deleted += 1
                        except Exception:
                            pass
            from app.services.db_service import db_service
            db_service.mark_cache_cleared()
        except Exception as e:
            logger.error(f"Error clearing cache: {e}")
        return deleted

    def prepare_studio_cache(
        self,
        video_id: str,
        title: str,
        artist: str,
        album: str = "",
        thumbnail_url: Optional[str] = None,
        year: Optional[str] = None,
        genre: Optional[str] = None,
    ) -> Optional[str]:
        """
        Download and transcode audio to local MP3 with complete ID3 tags, Year, Genre,
        and high-res Cover Art (both embedded ID3v2 APIC and sidecar .jpg for RadioBOSS).
        """
        clean_id = video_id.replace(".mp3", "").strip()

        # Sanitize filename for Windows filesystem
        safe_base = f"{artist} - {title}".strip(" -") if artist else title
        safe_name = re.sub(r'[\\/*?:"<>|]', "", safe_base).strip() or clean_id
        target_mp3 = os.path.join(self.cache_dir, f"{safe_name}.mp3")
        target_cover = os.path.join(self.cache_dir, f"{safe_name}.jpg")

        # Fallback to cached yt-dlp metadata if parameters missing
        cached_meta = ytdlp_service.get_track_metadata(clean_id)
        if not thumbnail_url:
            thumbnail_url = cached_meta.get("thumbnail_url")
        if not year:
            year = cached_meta.get("year") or ""
        if not genre or genre == "Radio Request":
            genre = cached_meta.get("genre") or "Pop"

        # Reuse if already cached and valid (> 100 KB)
        if os.path.isfile(target_mp3) and os.path.getsize(target_mp3) > 102400:
            logger.info(f"Reusing cached studio audio: {target_mp3}")
            try:
                from app.services.db_service import db_service
                db_service.register_cached_file(
                    video_id=clean_id,
                    file_path=target_mp3,
                    file_size_bytes=os.path.getsize(target_mp3),
                    title=title,
                    artist=artist,
                    album=album,
                    thumbnail_url=thumbnail_url,
                    year=year,
                    genre=genre,
                )
            except Exception as e:
                logger.debug(f"Failed to register reused cache in DB: {e}")
            return target_mp3

        logger.info(f"Preparing studio master cache for '{artist} - {title}' ({clean_id})...")

        try:
            stream_url, headers = ytdlp_service.get_live_stream_details(clean_id)
            if not stream_url:
                logger.error(f"Failed to get stream url for {clean_id}")
                return None

            # Retrieve updated metadata if fetched fresh by ytdlp
            fresh_meta = ytdlp_service.get_track_metadata(clean_id)
            if not thumbnail_url:
                thumbnail_url = fresh_meta.get("thumbnail_url")
            if not year:
                year = fresh_meta.get("year") or ""
            if not genre or genre == "Radio Request":
                genre = fresh_meta.get("genre") or "Pop"

            ffmpeg_bin = _find_ffmpeg_binary()

            # Download cover art thumbnail & save as sidecar .jpg for RadioBOSS native reader
            cover_tmp = None
            if thumbnail_url:
                try:
                    cover_tmp = target_cover
                    req = urllib.request.Request(
                        thumbnail_url,
                        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                    )
                    with urllib.request.urlopen(req, timeout=8) as resp, open(cover_tmp, "wb") as f:
                        f.write(resp.read())
                    logger.info(f"Cover art downloaded and saved to: {target_cover}")
                except Exception as e:
                    logger.debug(f"Could not download thumbnail for {clean_id}: {e}")
                    cover_tmp = None

            # Build FFmpeg command
            ffmpeg_cmd = [
                ffmpeg_bin,
                "-y",
                "-reconnect", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "5",
            ]

            user_agent = headers.get("User-Agent") if headers else None
            if user_agent:
                ffmpeg_cmd.extend(["-user_agent", user_agent])

            ffmpeg_cmd.extend(["-i", stream_url])

            has_cover = cover_tmp and os.path.isfile(cover_tmp) and os.path.getsize(cover_tmp) > 1000
            if has_cover:
                ffmpeg_cmd.extend([
                    "-i", cover_tmp,
                    "-map", "0:a",
                    "-map", "1:v",
                    "-c:v", "mjpeg",
                    "-metadata:s:v", "title=Album cover",
                    "-metadata:s:v", "comment=Cover (front)",
                ])
            else:
                ffmpeg_cmd.append("-vn")

            # EBU R128 Loudness Normalization (-14 LUFS, Target True Peak -1.5 dB)
            try:
                cfg = settings_service.get_config()
                if getattr(cfg, "enable_loudnorm", True):
                    ffmpeg_cmd.extend(["-af", "loudnorm=I=-14:LRA=7:tp=-1.5"])
            except Exception as e:
                logger.warning(f"Could not apply loudnorm filter: {e}")

            ffmpeg_cmd.extend([
                "-c:a", "libmp3lame",
                "-b:a", "320k",
                "-id3v2_version", "3",
                "-write_id3v1", "1",
                "-metadata", f"title={title}",
                "-metadata", f"artist={artist or 'YouTube Music'}",
                "-metadata", f"album={album or 'Single'}",
                "-metadata", f"date={year or ''}",
                "-metadata", f"year={year or ''}",
                "-metadata", f"genre={genre or 'Pop'}",
                target_mp3,
            ])

            popen_kwargs = {"capture_output": True, "timeout": 60}
            if sys.platform == "win32":
                popen_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

            proc = subprocess.run(ffmpeg_cmd, **popen_kwargs)

            if proc.returncode == 0 and os.path.isfile(target_mp3) and os.path.getsize(target_mp3) > 50000:
                logger.info(f"Studio master MP3 created successfully with ID3 & artwork: {target_mp3}")
                try:
                    from app.services.db_service import db_service
                    db_service.register_cached_file(
                        video_id=clean_id,
                        file_path=target_mp3,
                        file_size_bytes=os.path.getsize(target_mp3),
                        title=title,
                        artist=artist,
                        album=album,
                        thumbnail_url=thumbnail_url,
                        year=year,
                        genre=genre,
                    )
                except Exception as e:
                    logger.debug(f"Failed to register new cache in DB: {e}")

                try:
                    cfg = settings_service.get_config()
                    if getattr(cfg, "auto_cleanup_cache", True):
                        self.enforce_cache_limit()
                except Exception:
                    pass

                return target_mp3
            else:
                logger.warning(f"FFmpeg failed to create cached MP3. Exit code: {proc.returncode}")
                return None

        except Exception as e:
            logger.error(f"Error preparing studio cache for {clean_id}: {e}")
            return None


cache_service = CacheService()
