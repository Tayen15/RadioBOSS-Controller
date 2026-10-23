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


def _parse_duration_str(duration_str: Optional[str]) -> int:
    """Convert mm:ss or hh:mm:ss into integer seconds."""
    if not duration_str:
        return 0
    parts = str(duration_str).strip().split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except (ValueError, TypeError):
        return 0
    return 0


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

    def get_recommendations(self, video_id: str, limit: int = 10) -> List[TrackItem]:
        """
        Fetch infinite radio / up-next recommendations for a song.
        Uses YouTube Music watch playlist engine to find matching vibe & genre tracks.
        """
        clean_id = video_id.replace(".mp3", "").strip()
        if not self._client:
            self._client = YTMusic()

        tracks: List[TrackItem] = []
        try:
            watch_playlist = self._client.get_watch_playlist(videoId=clean_id, limit=limit + 5)
            raw_tracks = watch_playlist.get("tracks", [])

            for item in raw_tracks:
                v_id = item.get("videoId")
                if not v_id or v_id == clean_id:
                    continue

                title = item.get("title", "Unknown Title")
                artists = [
                    a.get("name")
                    for a in item.get("artists", [])
                    if isinstance(a, dict) and a.get("name")
                ]
                album_info = item.get("album")
                album_name = None
                if isinstance(album_info, dict):
                    album_name = album_info.get("name")
                elif isinstance(album_info, str):
                    album_name = album_info

                duration_str = item.get("length") or item.get("duration") or "00:00"
                duration_seconds = _parse_duration_str(duration_str)

                thumbs = item.get("thumbnail") or item.get("thumbnails") or []
                thumbnail_url = _get_best_thumbnail(thumbs)
                watch_url = f"https://music.youtube.com/watch?v={v_id}"

                tracks.append(
                    TrackItem(
                        video_id=v_id,
                        title=title,
                        artists=artists,
                        album=album_name,
                        duration_seconds=duration_seconds,
                        duration_formatted=_format_seconds(duration_seconds),
                        thumbnail_url=thumbnail_url,
                        url=watch_url,
                        year=None,
                        genre="Radio Recommendation",
                    )
                )

                if len(tracks) >= limit:
                    break

        except Exception as e:
            logger.error(f"Error fetching recommendations for {clean_id}: {e}")

        return tracks

    def get_artist_top_tracks(self, artist_name: str, limit: int = 6) -> List[TrackItem]:
        """
        Fetch top popular tracks by the given artist.
        Searches the artist profile on YouTube Music and queries their top songs shelf.
        """
        if not self._client:
            self._client = YTMusic()

        clean_artist = artist_name.strip()
        if not clean_artist:
            return []

        tracks: List[TrackItem] = []
        try:
            artist_results = self._client.search(clean_artist, filter="artists")
            if artist_results:
                first_artist = artist_results[0]
                browse_id = first_artist.get("browseId")
                if browse_id:
                    artist_data = self._client.get_artist(browse_id)
                    songs = artist_data.get("songs", {}).get("results", [])

                    for s in songs:
                        v_id = s.get("videoId")
                        if not v_id:
                            continue

                        title = s.get("title", "Unknown Title")
                        artists = [
                            a.get("name")
                            for a in s.get("artists", [])
                            if isinstance(a, dict) and a.get("name")
                        ]
                        if not artists:
                            artists = [clean_artist]

                        album_info = s.get("album")
                        album_name = None
                        if isinstance(album_info, dict):
                            album_name = album_info.get("name")
                        elif isinstance(album_info, str):
                            album_name = album_info

                        duration_str = s.get("length") or s.get("duration") or "00:00"
                        duration_seconds = _parse_duration_str(duration_str)

                        thumbs = s.get("thumbnails") or s.get("thumbnail") or []
                        thumbnail_url = _get_best_thumbnail(thumbs)
                        watch_url = f"https://music.youtube.com/watch?v={v_id}"

                        tracks.append(
                            TrackItem(
                                video_id=v_id,
                                title=title,
                                artists=artists,
                                album=album_name,
                                duration_seconds=duration_seconds,
                                duration_formatted=_format_seconds(duration_seconds),
                                thumbnail_url=thumbnail_url,
                                url=watch_url,
                                year=None,
                                genre="Artist Top Track",
                            )
                        )

                        if len(tracks) >= limit:
                            break
        except Exception as e:
            logger.warning(f"Could not fetch artist page songs for {clean_artist}: {e}")

        # Fallback to search_songs if artist page had no results
        if not tracks:
            tracks = self.search_songs(clean_artist, limit=limit)

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
