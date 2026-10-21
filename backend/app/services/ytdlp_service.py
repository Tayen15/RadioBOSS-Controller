"""yt-dlp Service: Extracts direct audio streams without downloading files."""
import logging
import time
from typing import Optional, Tuple, Dict
import yt_dlp
from app.schemas.track import TrackItem
from app.services.ytmusic_service import _format_seconds, _get_best_thumbnail

logger = logging.getLogger(__name__)


def _sanitize_youtube_url(url_or_id: str) -> str:
    """Normalize video ID or URL into standard YouTube watch URL."""
    url = url_or_id.strip()
    if url.startswith(("http://", "https://")):
        return url
    # Assume 11-char video ID
    return f"https://www.youtube.com/watch?v={url}"


class YTDLPService:
    """Service utilizing yt-dlp to extract clean audio stream URLs."""

    def __init__(self):
        # Format prioritizing M4A / AAC for RadioBOSS BASS engine compatibility
        self.ydl_opts = {
            "format": "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best",
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
            "nocheckcertificate": True,
            "ignoreerrors": False,
            "logtostderr": False,
        }
        # In-memory cache for stream URLs: video_id -> (stream_url, headers, expire_time)
        self._url_cache: Dict[str, Tuple[str, dict, float]] = {}
        # In-memory cache for metadata: video_id -> dict(title, artist, album)
        self._meta_cache: Dict[str, dict] = {}

    def get_track_metadata(self, video_id: str) -> dict:
        """Get cached metadata or extract fallback."""
        clean_id = video_id.replace(".mp3", "").strip()
        if clean_id in self._meta_cache:
            return self._meta_cache[clean_id]
        return {
            "title": "YouTube Audio",
            "artist": "Radio Caster Bridge",
            "album": "Studio Stream",
            "year": "",
            "genre": "Pop",
            "thumbnail_url": None,
        }

    def extract_track_info(self, url_or_id: str) -> Tuple[Optional[TrackItem], Optional[str]]:
        """
        Extract track metadata and direct audio stream URL.
        Returns: (TrackItem, direct_stream_url)
        """
        target_url = _sanitize_youtube_url(url_or_id)

        try:
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                info = ydl.extract_info(target_url, download=False)
                if not info:
                    return None, None

                # yt-dlp might return a playlist or single item
                if "entries" in info and info["entries"]:
                    info = info["entries"][0]

                video_id = info.get("id") or url_or_id
                title = info.get("title", "Unknown Title")
                uploader = info.get("uploader") or info.get("channel") or info.get("artist") or "Unknown Artist"
                album = info.get("album")
                duration = info.get("duration")
                thumbnail = info.get("thumbnail") or _get_best_thumbnail(info.get("thumbnails", []))
                
                # Direct audio stream URL
                stream_url = info.get("url")

                # If direct url not in top-level, search formats
                if not stream_url and "formats" in info:
                    for f in reversed(info["formats"]):
                        if f.get("acodec") != "none" and f.get("vcodec") == "none":
                            stream_url = f.get("url")
                            break

                # Extract year
                rel_year = info.get("release_year")
                if not rel_year:
                    rel_date = info.get("release_date") or info.get("upload_date") or ""
                    rel_year = rel_date[:4] if len(rel_date) >= 4 else ""
                year_str = str(rel_year).strip() if rel_year else ""

                # Extract genre
                raw_genre = info.get("genre")
                if not raw_genre and info.get("tags"):
                    raw_genre = info.get("tags")[0]
                genre_str = str(raw_genre).strip() if raw_genre else "Pop"

                track = TrackItem(
                    video_id=video_id,
                    title=title,
                    artists=[uploader] if uploader else [],
                    album=album,
                    duration_seconds=duration,
                    duration_formatted=_format_seconds(duration),
                    thumbnail_url=thumbnail,
                    url=f"https://music.youtube.com/watch?v={video_id}",
                    year=year_str or None,
                    genre=genre_str or "Pop",
                )

                # Cache stream URL and metadata for 30 minutes
                if stream_url:
                    headers = info.get("http_headers", {})
                    self._url_cache[video_id] = (stream_url, headers, time.time() + 1800)
                    self._meta_cache[video_id] = {
                        "title": title,
                        "artist": uploader,
                        "album": album or "",
                        "year": year_str,
                        "genre": genre_str,
                        "thumbnail_url": thumbnail,
                    }

                return track, stream_url

        except Exception as e:
            logger.error(f"Failed to extract info via yt-dlp for {target_url}: {e}")
            return None, None

    def get_live_stream_details(self, video_id: str) -> Tuple[Optional[str], dict]:
        """
        Get active stream URL and required HTTP headers for relaying.
        Refreshes automatically if expired or not cached.
        """
        clean_id = video_id.replace(".mp3", "").strip()
        now = time.time()
        if clean_id in self._url_cache:
            stream_url, headers, expire_at = self._url_cache[clean_id]
            if now < expire_at:
                return stream_url, headers

        # Not in cache or expired -> fetch fresh
        logger.info(f"Resolving fresh audio stream for video_id: {clean_id}")
        target_url = f"https://www.youtube.com/watch?v={clean_id}"
        try:
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                info = ydl.extract_info(target_url, download=False)
                if not info:
                    return None, {}

                stream_url = info.get("url")
                if not stream_url and "formats" in info:
                    for f in reversed(info["formats"]):
                        if f.get("acodec") != "none" and f.get("vcodec") == "none":
                            stream_url = f.get("url")
                            break

                headers = info.get("http_headers", {})
                if stream_url:
                    title = info.get("title", "Unknown Title")
                    uploader = info.get("uploader") or info.get("channel") or info.get("artist") or "Unknown Artist"
                    album = info.get("album") or ""
                    
                    # Extract year
                    rel_year = info.get("release_year")
                    if not rel_year:
                        rel_date = info.get("release_date") or info.get("upload_date") or ""
                        rel_year = rel_date[:4] if len(rel_date) >= 4 else ""
                    year_str = str(rel_year).strip() if rel_year else ""

                    # Extract genre
                    raw_genre = info.get("genre")
                    if not raw_genre and info.get("tags"):
                        raw_genre = info.get("tags")[0]
                    genre_str = str(raw_genre).strip() if raw_genre else "Pop"

                    thumbnail = info.get("thumbnail")

                    self._url_cache[clean_id] = (stream_url, headers, now + 1800)
                    self._meta_cache[clean_id] = {
                        "title": title,
                        "artist": uploader,
                        "album": album,
                        "year": year_str,
                        "genre": genre_str,
                        "thumbnail_url": thumbnail,
                    }
                    return stream_url, headers
        except Exception as e:
            logger.error(f"Error fetching live stream details for {video_id}: {e}")

        return None, {}


# Singleton instance
ytdlp_service = YTDLPService()
