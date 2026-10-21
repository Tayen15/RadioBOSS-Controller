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
    """Find ffmpeg binary in executable dir, local dist, or PATH."""
    candidates = []
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        candidates.append(os.path.join(exe_dir, "ffmpeg.exe"))
        if hasattr(sys, "_MEIPASS"):
            candidates.append(os.path.join(sys._MEIPASS, "ffmpeg.exe"))

    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    candidates.extend([
        os.path.join(project_root, "dist", "ffmpeg.exe"),
        os.path.join(os.getcwd(), "dist", "ffmpeg.exe"),
        os.path.join(os.getcwd(), "ffmpeg.exe"),
        r"D:\Apps\ffmpeg\bin\ffmpeg.exe",
    ])

    for c in candidates:
        if os.path.isfile(c):
            return os.path.abspath(c)

    which = shutil.which("ffmpeg")
    return which or "ffmpeg"


class CacheService:
    """Manages local broadcast audio cache with rich ID3v2 metadata and artwork."""

    def __init__(self):
        pass

    @property
    def cache_dir(self) -> str:
        """Resolve effective audio cache directory (custom or %APPDATA%/RadioBOSSCaster/cache)."""
        try:
            cfg = settings_service.get_config()
            if cfg.custom_cache_dir and cfg.custom_cache_dir.strip():
                target = cfg.custom_cache_dir.strip()
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
        """Calculate number of cached tracks and total disk usage."""
        total_files = 0
        total_size = 0
        try:
            if os.path.isdir(self.cache_dir):
                for entry in os.scandir(self.cache_dir):
                    if entry.is_file():
                        total_files += 1
                        total_size += entry.stat().st_size
        except Exception as e:
            logger.error(f"Error reading cache stats: {e}")

        size_mb = round(total_size / (1024 * 1024), 2)
        return {
            "cache_dir": self.cache_dir,
            "total_files": total_files,
            "total_size_bytes": total_size,
            "total_size_mb": size_mb,
        }

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
                return target_mp3
            else:
                logger.warning(f"FFmpeg failed to create cached MP3. Exit code: {proc.returncode}")
                return None

        except Exception as e:
            logger.error(f"Error preparing studio cache for {clean_id}: {e}")
            return None


cache_service = CacheService()
