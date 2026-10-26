"""yt-dlp Service: Resilient audio stream extraction and fallback downloader for YouTube Music."""
import glob
import logging
import os
import time
from typing import Optional, Tuple, Dict, List
import yt_dlp
from app.schemas.track import TrackItem
from app.services.ytmusic_service import _format_seconds, _get_best_thumbnail

logger = logging.getLogger(__name__)


def _sanitize_youtube_url(url_or_id: str) -> str:
    """Normalize video ID or URL into standard YouTube watch URL."""
    url = url_or_id.strip()
    if url.startswith(("http://", "https://")):
        return url
    return f"https://www.youtube.com/watch?v={url}"


def _find_optional_cookiefile() -> Optional[str]:
    """Return path to cookies.txt if user placed one in app data or portable data dir."""
    candidates = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        candidates.append(os.path.join(appdata, "RadioBOSSCaster", "cookies.txt"))
    candidates.append(os.path.join(os.getcwd(), "data", "cookies.txt"))
    candidates.append(os.path.join(os.getcwd(), "cookies.txt"))
    for c in candidates:
        if os.path.isfile(c) and os.path.getsize(c) > 32:
            return c
    return None


class YTDLPService:
    """Service utilizing yt-dlp with multi-client fallback to extract clean audio streams."""

    def __init__(self):
        # Base options prioritizing M4A / AAC for RadioBOSS BASS engine compatibility
        self.base_opts = {
            "format": "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best",
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
            "nocheckcertificate": True,
            "ignoreerrors": False,
            "logtostderr": False,
            "js_runtimes": {"bun": {}, "node": {}, "deno": {}},
        }
        # In-memory cache for stream URLs: video_id -> (stream_url, headers, expire_time)
        self._url_cache: Dict[str, Tuple[str, dict, float]] = {}
        # In-memory cache for metadata: video_id -> dict(title, artist, album, year, genre, thumbnail_url)
        self._meta_cache: Dict[str, dict] = {}

    def _get_extraction_strategies(self) -> List[Tuple[str, dict]]:
        """Build ordered list of yt-dlp extraction option sets for maximum resilience."""
        cookiefile = _find_optional_cookiefile()
        common = dict(self.base_opts)
        if cookiefile:
            common["cookiefile"] = cookiefile

        strategies: List[Tuple[str, dict]] = [
            (
                "default",
                dict(common),
            ),
            (
                "android_vr_visionos",
                {
                    **common,
                    "format": "bestaudio[ext=m4a]/bestaudio/best",
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["android_vr", "visionos", "default"],
                        }
                    },
                },
            ),
            (
                "web_safari_ios",
                {
                    **common,
                    "format": "bestaudio/best",
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["web_safari", "ios", "mweb"],
                        }
                    },
                },
            ),
        ]
        return strategies

    def _extract_stream_url_from_info(self, info: dict) -> Optional[str]:
        """Extract best audio URL from yt-dlp info dictionary."""
        stream_url = info.get("url")
        if not stream_url and "formats" in info:
            # Prefer direct https audio-only streams first
            for f in reversed(info["formats"]):
                if (
                    f.get("acodec") != "none"
                    and f.get("vcodec") == "none"
                    and f.get("url")
                    and str(f.get("protocol", "")).startswith("http")
                ):
                    stream_url = f.get("url")
                    break
            # Fallback to any format with audio
            if not stream_url:
                for f in reversed(info["formats"]):
                    if f.get("acodec") != "none" and f.get("url"):
                        stream_url = f.get("url")
                        break
        return stream_url

    def _extract_info_resilient(self, target_url: str) -> Optional[dict]:
        """Try multiple yt-dlp client strategies until a valid audio stream URL is extracted."""
        last_error = None
        for strategy_name, opts in self._get_extraction_strategies():
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(target_url, download=False)
                    if not info:
                        continue
                    if "entries" in info and info["entries"]:
                        info = info["entries"][0]
                    stream_url = self._extract_stream_url_from_info(info)
                    if stream_url:
                        info["_resolved_stream_url"] = stream_url
                        if strategy_name != "default":
                            logger.info(
                                f"Resolved {target_url} using fallback strategy '{strategy_name}'"
                            )
                        return info
            except Exception as e:
                last_error = e
                logger.warning(
                    f"yt-dlp strategy '{strategy_name}' failed for {target_url}: {e}"
                )

        if last_error:
            logger.error(f"All yt-dlp strategies failed for {target_url}: {last_error}")
        return None

    def _cache_info_dict(self, clean_id: str, info: dict, stream_url: str) -> None:
        """Store extracted stream URL and track metadata into memory cache."""
        existing_meta = self._meta_cache.get(clean_id, {})
        title = existing_meta.get("title") or info.get("title") or "Unknown Title"
        uploader = (
            existing_meta.get("artist")
            or info.get("artist")
            or info.get("uploader")
            or info.get("channel")
            or "Unknown Artist"
        )
        album = existing_meta.get("album") or info.get("album") or ""

        rel_year = info.get("release_year")
        if not rel_year:
            rel_date = info.get("release_date") or info.get("upload_date") or ""
            rel_year = rel_date[:4] if len(rel_date) >= 4 else ""
        year_str = existing_meta.get("year") or (str(rel_year).strip() if rel_year else "")

        raw_genre = info.get("genre")
        if not raw_genre and info.get("tags"):
            raw_genre = info.get("tags")[0]
        genre_str = existing_meta.get("genre") or (str(raw_genre).strip() if raw_genre else "Pop")

        thumbnail = (
            existing_meta.get("thumbnail_url")
            or info.get("thumbnail")
            or _get_best_thumbnail(info.get("thumbnails", []))
        )

        headers = info.get("http_headers", {})
        self._url_cache[clean_id] = (stream_url, headers, time.time() + 1800)
        self._meta_cache[clean_id] = {
            "title": title,
            "artist": uploader,
            "album": album,
            "year": year_str,
            "genre": genre_str,
            "thumbnail_url": thumbnail,
        }

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
        info = self._extract_info_resilient(target_url)
        if not info:
            return None, None

        video_id = info.get("id") or url_or_id
        title = info.get("title", "Unknown Title")
        uploader = (
            info.get("artist")
            or info.get("uploader")
            or info.get("channel")
            or "Unknown Artist"
        )
        album = info.get("album")
        duration = info.get("duration")
        thumbnail = info.get("thumbnail") or _get_best_thumbnail(info.get("thumbnails", []))
        stream_url = info.get("_resolved_stream_url") or self._extract_stream_url_from_info(info)

        rel_year = info.get("release_year")
        if not rel_year:
            rel_date = info.get("release_date") or info.get("upload_date") or ""
            rel_year = rel_date[:4] if len(rel_date) >= 4 else ""
        year_str = str(rel_year).strip() if rel_year else ""

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

        if stream_url:
            self._cache_info_dict(video_id, info, stream_url)

        return track, stream_url

    def get_live_stream_details(self, video_id: str) -> Tuple[Optional[str], dict]:
        """
        Get active stream URL and required HTTP headers for relaying or caching.
        Automatically tries fallback player clients and alternative official audio uploads if blocked.
        """
        clean_id = video_id.replace(".mp3", "").strip()
        now = time.time()
        if clean_id in self._url_cache:
            stream_url, headers, expire_at = self._url_cache[clean_id]
            if now < expire_at and stream_url:
                return stream_url, headers

        logger.info(f"Resolving fresh audio stream for video_id: {clean_id}")
        target_url = f"https://www.youtube.com/watch?v={clean_id}"
        info = self._extract_info_resilient(target_url)

        if info:
            stream_url = info.get("_resolved_stream_url") or self._extract_stream_url_from_info(info)
            if stream_url:
                self._cache_info_dict(clean_id, info, stream_url)
                return stream_url, info.get("http_headers", {})

        # Fallback: If specific video_id is restricted/blocked, search alternate official track by Artist - Title
        meta = self._meta_cache.get(clean_id, {})
        artist = meta.get("artist", "").strip()
        title = meta.get("title", "").strip()
        if title and title != "YouTube Audio":
            search_query = f"{artist} - {title} official audio".strip(" -")
            logger.info(
                f"Primary video_id {clean_id} unavailable; searching alternate stream for '{search_query}'"
            )
            alt_info = self._extract_info_resilient(f"ytsearch1:{search_query}")
            if alt_info:
                alt_url = alt_info.get("_resolved_stream_url") or self._extract_stream_url_from_info(alt_info)
                if alt_url:
                    self._cache_info_dict(clean_id, alt_info, alt_url)
                    return alt_url, alt_info.get("http_headers", {})

        return None, {}

    def download_audio_to_file(self, video_id: str, output_stem: str) -> Optional[str]:
        """
        Download raw audio stream using yt-dlp's native chunked downloader to a local file.
        Used as a reliable fallback when direct FFmpeg HTTP streaming encounters 403/HLS issues.
        Returns the path to the downloaded temporary audio file, or None if failed.
        """
        clean_id = video_id.replace(".mp3", "").strip()
        target_url = f"https://www.youtube.com/watch?v={clean_id}"

        for strategy_name, base_strategy_opts in self._get_extraction_strategies():
            dl_opts = {
                **base_strategy_opts,
                "skip_download": False,
                "outtmpl": f"{output_stem}.%(ext)s",
                "overwrites": True,
            }
            try:
                with yt_dlp.YoutubeDL(dl_opts) as ydl:
                    ydl.download([target_url])

                # Locate the downloaded file matching output_stem.*
                for candidate in glob.glob(f"{glob.escape(output_stem)}.*"):
                    if (
                        os.path.isfile(candidate)
                        and not candidate.endswith((".part", ".ytdl", ".jpg", ".mp3"))
                        and os.path.getsize(candidate) > 30000
                    ):
                        logger.info(
                            f"Downloaded raw audio via yt-dlp ({strategy_name}): {candidate}"
                        )
                        return candidate
            except Exception as e:
                logger.warning(
                    f"yt-dlp native download ({strategy_name}) failed for {clean_id}: {e}"
                )

        return None


# Singleton instance
ytdlp_service = YTDLPService()
