"""YouTube Music Service: Dedicated to searching official studio master tracks."""
import logging
from typing import List, Optional
from ytmusicapi import YTMusic
from app.schemas.track import TrackItem

logger = logging.getLogger(__name__)


def _format_seconds(seconds: Optional[int]) -> str:
    """Format seconds into mm:ss or hh:mm:ss string."""
    if not seconds or seconds < 0:
        return "00:00"
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _get_best_thumbnail(thumbnails: list) -> Optional[str]:
    """Extract highest resolution square thumbnail."""
    if not thumbnails:
        return None
    # Sort by width/height descending
    try:
        sorted_thumbs = sorted(
            thumbnails,
            key=lambda t: t.get("width", 0) * t.get("height", 0),
            reverse=True
        )
        url = sorted_thumbs[0].get("url")
        if url and "googleusercontent.com" in url:
            # Upgrade thumbnail resolution if needed
            # e.g., replace =w60-h60 or =w120-h120 with =w544-h544
            import re
            return re.sub(r'=w\d+-h\d+', '=w544-h544', url)
        return url
    except Exception:
        return thumbnails[-1].get("url") if thumbnails else None


class YTMusicService:
    """Service wrapping ytmusicapi for song-specific queries."""

    def __init__(self):
        try:
            self._client = YTMusic()
            logger.info("YTMusicService initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize YTMusic: {e}")
            self._client = None

    def search_songs(self, query: str, limit: int = 5) -> List[TrackItem]:
        """Search YouTube Music specifically for official studio songs (filter='songs')."""
        if not self._client:
            self._client = YTMusic()

        try:
            raw_results = self._client.search(query=query, filter="songs", limit=limit)
            if limit and isinstance(raw_results, list):
                raw_results = raw_results[:limit]
        except Exception as e:
            logger.error(f"Error executing YouTube Music search for '{query}': {e}")
            return []

        tracks: List[TrackItem] = []
        for item in raw_results:
            video_id = item.get("videoId")
            if not video_id:
                continue

            title = item.get("title", "Unknown Title")
            artists = [a.get("name") for a in item.get("artists", []) if a.get("name")]
            album_info = item.get("album")
            album_name = album_info.get("name") if album_info else None
            
            # Duration parsing
            duration_str = item.get("duration", "00:00")
            duration_seconds = item.get("duration_seconds")
            if not duration_seconds and duration_str:
                # Convert mm:ss to seconds
                parts = duration_str.split(":")
                try:
                    if len(parts) == 2:
                        duration_seconds = int(parts[0]) * 60 + int(parts[1])
                    elif len(parts) == 3:
                        duration_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                except ValueError:
                    duration_seconds = 0

            thumbnail_url = _get_best_thumbnail(item.get("thumbnails", []))
            watch_url = f"https://music.youtube.com/watch?v={video_id}"

            # Year extraction from song search metadata
            raw_year = item.get("year")
            year_str = str(raw_year).strip() if raw_year else None

            tracks.append(
                TrackItem(
                    video_id=video_id,
                    title=title,
                    artists=artists,
                    album=album_name,
                    duration_seconds=duration_seconds,
                    duration_formatted=_format_seconds(duration_seconds),
                    thumbnail_url=thumbnail_url,
                    url=watch_url,
                    year=year_str,
                    genre="Pop",
                )
            )

        return tracks

    def get_lyrics_and_talking_points(self, video_id: str) -> dict:
        """
        Fetch lyrics and announcer cue/talking points for a YouTube Music song.
        """
        clean_id = video_id.replace(".mp3", "").strip()
        if not self._client:
            self._client = YTMusic()

        lyrics_text = None
        lyrics_source = None

        try:
            watch_playlist = self._client.get_watch_playlist(videoId=clean_id)
            lyrics_id = watch_playlist.get("lyrics")
            if lyrics_id:
                lyrics_data = self._client.get_lyrics(browseId=lyrics_id)
                if lyrics_data:
                    lyrics_text = lyrics_data.get("lyrics")
                    lyrics_source = lyrics_data.get("source")
        except Exception as e:
            logger.debug(f"Could not fetch lyrics for {clean_id}: {e}")

        # Construct Announcer Talking Points & Cues
        talking_points = {
            "intro_talk_window": "00:00 - 00:14 (Intro sebelum vokal)",
            "outro_talk_window": "15 detik sebelum lagu selesai (Fade out)",
            "broadcaster_tips": [
                "Gunakan intro musik untuk menyapa pendengar dan membacakan request.",
                "Kutipkan satu baris lirik yang paling berkesan sebagai penutup lagu.",
                "Pastikan mic ducking aktif saat berbicara di atas intro lagu.",
            ],
        }

        return {
            "video_id": clean_id,
            "has_lyrics": bool(lyrics_text),
            "lyrics": lyrics_text or "Lirik lagu ini belum tersedia di katalog YouTube Music.",
            "source": lyrics_source or "YouTube Music / LyricFind",
            "talking_points": talking_points,
        }


# Singleton instance
ytmusic_service = YTMusicService()
