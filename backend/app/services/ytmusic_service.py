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


def _analyze_song_vibe(lyrics_text: Optional[str], year: Optional[str], genre: Optional[str]) -> tuple:
    """
    Classify song mood & emotional vibe from lyrics, release era, and genre keywords.
    Returns: (vibe_category, vibe_title, vibe_badge)
    """
    text_lower = (lyrics_text or "").lower()

    sad_keywords = [
        "menangis", "air mata", "terluka", "perih", "kecewa", "lupakan", "pergi", "sakit",
        "sendiri", "sedih", "merana", "hancur", "patah hati", "duri", "menyesal", "tears",
        "crying", "cry", "pain", "heartbreak", "sorrow", "lonely", "broken", "goodbye",
        "miss you", "hurt", "losing you", "hilang", "sesal"
    ]
    romance_keywords = [
        "cinta", "sayang", "merindukan", "rindu", "peluk", "setia", "kekasih", "bersamamu",
        "hati", "bidadari", "indah", "selamanya", "menikah", "bunga", "kasih", "pujaanku",
        "memelukmu", "love", "heart", "forever", "darling", "kiss", "romantic", "sweet",
        "beautiful", "together", "hold me", "baby", "loved"
    ]
    party_keywords = [
        "berlari", "terbang", "menari", "semangat", "pesta", "party", "dance", "beat",
        "jump", "senyum", "bahagia", "ceria", "gembira", "bangkit", "sinar", "rock",
        "celebration", "fun", "happy", "tonight", "move", "groove", "energy", "fire",
        "glow", "shout", "crazy", "electric", "disko"
    ]
    chill_keywords = [
        "kopi", "senja", "malam", "bintang", "tenang", "damai", "santai", "angin", "sunyi",
        "melangkah", "jalan", "hujan", "tidur", "mimpi", "chill", "relax", "peaceful",
        "night", "coffee", "stars", "calm", "quiet", "breeze", "rain", "ocean", "waves"
    ]

    score_sad = sum(1 for w in sad_keywords if w in text_lower)
    score_romance = sum(1 for w in romance_keywords if w in text_lower)
    score_party = sum(1 for w in party_keywords if w in text_lower)
    score_chill = sum(1 for w in chill_keywords if w in text_lower)

    max_score = max(score_sad, score_romance, score_party, score_chill)
    if max_score >= 2:
        if max_score == score_sad:
            return ("sad", "Melankolis & Patah Hati", "💔 Melankolis & Patah Hati")
        if max_score == score_romance:
            return ("romance", "Romantis & Kasih Sayang", "💖 Romantis & Manis")
        if max_score == score_party:
            return ("party", "Upbeat & Berenergi", "🔥 Upbeat & Berenergi")
        if max_score == score_chill:
            return ("chill", "Santai & Syahdu", "☕ Santai & Syahdu")

    # Era / Nostalgia check if year is older than 2012
    if year:
        try:
            yr_int = int(str(year).strip()[:4])
            if yr_int <= 2010:
                return ("nostalgia", f"Nostalgia Klasik ({yr_int})", f"📻 Nostalgia Klasik ({yr_int})")
        except Exception:
            pass

    return ("universal", "Radio Hits Favorit", "✨ Radio Hits Favorit")


def _extract_key_lyric_quote(lyrics_text: Optional[str], vibe_cat: str) -> Optional[str]:
    """
    Extract a high-impact, memorable lyric hook or chorus line from lyrics text.
    """
    if not lyrics_text:
        return None

    raw_lines = [l.strip() for l in lyrics_text.splitlines() if l.strip()]
    cleaned_lines = []
    for line in raw_lines:
        if line.startswith(("[", "(", "{")) or line.endswith((":", "]")):
            continue
        if len(line) < 14 or len(line) > 80:
            continue
        if any(skip in line.lower() for skip in ["writer:", "lyrics by", "produced by", "chorus", "verse"]):
            continue
        cleaned_lines.append(line)

    if not cleaned_lines:
        return None

    # Detect repeated hook line (typical of chorus / hook in popular music)
    from collections import Counter
    counts = Counter(cleaned_lines)
    for line, count in counts.items():
        if count >= 2:
            return line

    # Otherwise return the first impactful poetic line
    return cleaned_lines[0]


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
        Fetch lyrics and generate intelligent announcer cues, timing windows,
        and Indonesian on-air scripts tailored specifically to the song.
        """
        clean_id = video_id.replace(".mp3", "").strip()
        if not self._client:
            self._client = YTMusic()

        lyrics_text = None
        lyrics_source = None
        first_track: dict = {}

        try:
            watch_playlist = self._client.get_watch_playlist(videoId=clean_id)
            lyrics_id = watch_playlist.get("lyrics")
            if lyrics_id:
                lyrics_data = self._client.get_lyrics(browseId=lyrics_id)
                if lyrics_data:
                    lyrics_text = lyrics_data.get("lyrics")
                    lyrics_source = lyrics_data.get("source")
            tracks = watch_playlist.get("tracks")
            if tracks and len(tracks) > 0 and isinstance(tracks[0], dict):
                first_track = tracks[0]
        except Exception as e:
            logger.debug(f"Could not fetch lyrics/watch_playlist for {clean_id}: {e}")

        # Extract track info from watch_playlist
        song_title = first_track.get("title") or ""
        artists_list = [a.get("name") for a in first_track.get("artists", []) if a.get("name")]
        artist_name = ", ".join(artists_list) if artists_list else ""
        album_obj = first_track.get("album")
        album_name = album_obj.get("name") if isinstance(album_obj, dict) else (str(album_obj) if album_obj else "")
        year = str(first_track.get("year") or "").strip()
        duration_str = first_track.get("length") or "00:00"

        # Enrich from SQLite cached_tracks or queue_history if needed
        play_count = 0
        try:
            from app.services.db_service import db_service
            with db_service.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM cached_tracks WHERE video_id = ?;", (clean_id,))
                c_row = cursor.fetchone()
                if c_row:
                    if not song_title and c_row["title"]:
                        song_title = c_row["title"]
                    if not artist_name and c_row["artist"]:
                        artist_name = c_row["artist"]
                    if not album_name and c_row["album"]:
                        album_name = c_row["album"]
                    if not year and c_row["year"]:
                        year = str(c_row["year"])
                    if (not duration_str or duration_str == "00:00") and c_row["duration_formatted"]:
                        duration_str = c_row["duration_formatted"]
                    play_count = c_row["play_count"] or 0
                else:
                    cursor.execute("SELECT * FROM queue_history WHERE video_id = ? ORDER BY created_at DESC LIMIT 1;", (clean_id,))
                    h_row = cursor.fetchone()
                    if h_row:
                        if not song_title and h_row["title"]:
                            song_title = h_row["title"]
                        if not artist_name and h_row["artists"]:
                            import json
                            try:
                                parsed = json.loads(h_row["artists"])
                                if isinstance(parsed, list):
                                    artist_name = ", ".join(parsed)
                            except Exception:
                                artist_name = h_row["artists"]
                        if not album_name and h_row["album"]:
                            album_name = h_row["album"]
                        if not year and h_row["year"]:
                            year = str(h_row["year"])
        except Exception as e:
            logger.debug(f"DB enrichment exception: {e}")

        # Parse duration seconds
        total_seconds = _parse_duration_str(duration_str)
        if total_seconds <= 0:
            total_seconds = 210  # fallback 3:30

        # Dynamic Timing Cues
        if total_seconds < 160:
            intro_sec = 8
            intro_desc = "Intro Singkat"
        elif total_seconds > 260:
            intro_sec = 18
            intro_desc = "Intro Musik Panjang"
        else:
            intro_sec = 14
            intro_desc = "Intro Standar Radio"

        intro_talk_window = f"00:00 - {_format_seconds(intro_sec)} ({intro_desc})"
        mid_sec = total_seconds // 2
        station_id_cue = f"{_format_seconds(mid_sec)} (Sweep / Station ID)"
        outro_start = max(0, total_seconds - 18)
        outro_talk_window = f"{_format_seconds(outro_start)} - {_format_seconds(total_seconds)} (Backsell Fade-Out)"

        # Analyze Emotion & Vibe
        vibe_cat, vibe_title, vibe_badge = _analyze_song_vibe(lyrics_text, year, None)
        key_lyric_quote = _extract_key_lyric_quote(lyrics_text, vibe_cat)

        # Generate Tailored Broadcaster Scripts
        artist_display = artist_name or "musisi terbaik"
        title_display = song_title or "karya pilihan"
        year_phrase = f" rilisan tahun {year}" if year else ""
        album_phrase = f" dari album '{album_name}'" if album_name else ""
        quote_phrase = f'Kutipan liriknya yang berbunyi "{key_lyric_quote}" begitu berkesan.' if key_lyric_quote else ""

        if vibe_cat == "sad":
            intro_script = (
                f"Halo Sobat Radio, kita putarkan lagu melankolis penuh penghayatan dari {artist_display} "
                f"berjudul '{title_display}'{year_phrase}. Buat kamu yang lagi butuh teman syahdu di saat sepi "
                f"atau lagi mencoba merelakan, selamat mendengarkan..."
            )
            outro_script = (
                f"Baru saja kita dengarkan hits '{title_display}' dari {artist_display}{album_phrase}. "
                f"{quote_phrase} Menusuk banget di hati ya. Tetap bersama kami, masih banyak deretan lagu penenang jiwa lainnya."
            )
        elif vibe_cat == "romance":
            intro_script = (
                f"Halo Sobat Radio, saatnya kita nikmati lantunan manis penuh cinta dari {artist_display} "
                f"berjudul '{title_display}'{year_phrase}. Pas banget buat kamu dedikasikan ke orang terkasih. "
                f"Selamat menikmati alunan indahnya..."
            )
            outro_script = (
                f"Baru saja terdengar '{title_display}' dari {artist_display}{album_phrase}. "
                f"{quote_phrase} Hangat dan manis banget lagunya. Tetap stay tune di radio kesayangan kamu!"
            )
        elif vibe_cat == "party":
            intro_script = (
                f"Halo pendengar setia, saatnya kita naikkan energi dan semangat bareng track ritmis dari {artist_display} "
                f"berjudul '{title_display}'{year_phrase}! Bikin suasana makin hidup dan siap bikin harimu makin seru. Let's enjoy the groove!"
            )
            outro_script = (
                f"Itu dia track berenergi '{title_display}' dari {artist_display}! "
                f"Beat-nya bener-bener bikin suasana kembali fresh dan bersemangat. Tetap stay tune untuk deretan hits terbaik selanjutnya!"
            )
        elif vibe_cat == "chill":
            intro_script = (
                f"Halo Sobat Radio, mari rehat sejenak ditemani alunan santai dan syahdu dari {artist_display} "
                f"berjudul '{title_display}'{album_phrase}. Pas banget buat nemenin waktu rileks atau santai sore kamu..."
            )
            outro_script = (
                f"Baru saja kita nikmati kesyahduan lagu '{title_display}' dari {artist_display}. "
                f"{quote_phrase} Bikin pikiran jadi tenang dan adem. Terus dengarkan siaran kami untuk playlist santai lainnya."
            )
        elif vibe_cat == "nostalgia":
            intro_script = (
                f"Halo pendengar setia, saatnya kita bernostalgia dengan karya legendaris dari {artist_display} "
                f"berjudul '{title_display}'{year_phrase}. Membawa kembali memori manis masa lalu, selamat mendengarkan..."
            )
            outro_script = (
                f"Baru saja kita bernostalgia bersama lagu legendaris '{title_display}' dari {artist_display}{year_phrase}. "
                f"Lagu klasik yang nggak pernah gagal bikin kangen. Tetap pantengin siaran kami!"
            )
        else:
            intro_script = (
                f"Halo Sobat Radio, berikut lagu hits pilihan spesial dari {artist_display} "
                f"berjudul '{title_display}'{album_phrase}. Teman setia buat menemani aktivitas kamu hari ini, selamat menikmati..."
            )
            outro_script = (
                f"Baru saja kita dengarkan karya apik '{title_display}' dari {artist_display}{album_phrase}. "
                f"{quote_phrase} Tetap setia bersama kami, playlist terbaik hari ini masih akan terus berlanjut!"
            )

        # Broadcaster Tips
        tips = [
            f"Intro Ramp ({intro_talk_window}): Selesaikan sapaan sebelum detik ke-{intro_sec} agar vokal pertama {artist_display} terdengar jernih.",
            f"Midpoint Cue ({station_id_cue}): Titik ideal untuk menyisipkan jingle stasiun atau callout ID penyiar saat jeda instrumen.",
            f"Outro Backsell ({outro_talk_window}): Mulai bicara kembali saat instrumen mulai memudar sebelum lagu berikutnya dimulai.",
        ]
        if play_count > 0:
            tips.append(f"Statistik Studio: Lagu ini sudah diputar sebanyak {play_count} kali di stasiun radio Anda.")
        tips.append("Gunakan mic ducking otomatis RadioBOSS agar musik melirih saat Anda berbicara.")

        talking_points = {
            "intro_talk_window": intro_talk_window,
            "outro_talk_window": outro_talk_window,
            "station_id_cue": station_id_cue,
            "vibe": vibe_title,
            "vibe_badge": vibe_badge,
            "vibe_category": vibe_cat,
            "key_lyric_quote": key_lyric_quote,
            "intro_script": intro_script,
            "outro_script": outro_script,
            "broadcaster_tips": tips,
            "song_trivia": {
                "title": song_title or title_display,
                "artist": artist_name or artist_display,
                "album": album_name or "Single / Official Master",
                "release_year": year or "Official Release",
                "duration": duration_str,
                "play_count": play_count,
            },
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
