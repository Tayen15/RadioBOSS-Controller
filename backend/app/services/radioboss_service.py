"""RadioBOSS Remote Control Service: Interacts with RadioBOSS HTTP API."""
import logging
import os
import urllib.parse
from typing import Tuple, Optional, List
import httpx
import defusedxml.ElementTree as ET
from app.config import get_settings
from app.schemas.track import NowPlayingTrack, RadioBOSSStatusResponse, PlaylistItem

logger = logging.getLogger(__name__)


def _format_time_string(raw: Optional[str]) -> str:
    """
    Format duration or position from RadioBOSS XML into MM:SS or HH:MM:SS.
    Handles already-formatted strings ("03:45", "01:23:45") and numeric milliseconds/seconds.
    """
    if not raw:
        return "00:00"
    raw_str = str(raw).strip()
    if not raw_str or raw_str in ("––:––", "--:--", "0", "-1"):
        return "00:00"

    # Already formatted with colons (e.g., '03:45' or '01:23:45')
    if ":" in raw_str:
        return raw_str

    try:
        val = int(float(raw_str))
        if val <= 0:
            return "00:00"
        # If val > 10000, it is in milliseconds. If smaller, likely seconds
        seconds = val // 1000 if val > 10000 else val
        m, s = divmod(seconds, 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h:02d}:{m:02d}:{s:02d}"
        return f"{m:02d}:{s:02d}"
    except (ValueError, TypeError):
        return "00:00"


def _format_milliseconds(ms_str: Optional[str]) -> str:
    """Backwards compatibility alias for _format_time_string."""
    return _format_time_string(ms_str)


class RadioBOSSService:
    """Client for RadioBOSS Web Remote Control API."""

    def __init__(self):
        self.settings = get_settings()

    async def check_status(self) -> RadioBOSSStatusResponse:
        """
        Check RadioBOSS connectivity and fetch currently playing track.
        Calls action=playbackinfo.
        """
        base_url = self.settings.radioboss_base_url
        params = {
            "action": "playbackinfo",
        }
        if self.settings.RADIOBOSS_PASSWORD:
            params["pass"] = self.settings.RADIOBOSS_PASSWORD

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(base_url, params=params)

            if response.status_code == 401 or response.status_code == 403:
                return RadioBOSSStatusResponse(
                    connected=False,
                    error="Autentikasi gagal: Password RadioBOSS salah.",
                )

            if response.status_code != 200:
                return RadioBOSSStatusResponse(
                    connected=False,
                    error=f"RadioBOSS HTTP error: status {response.status_code}",
                )

            # Parse XML
            xml_text = response.text
            return self._parse_playback_info(xml_text)

        except httpx.ConnectError:
            return RadioBOSSStatusResponse(
                connected=False,
                error=f"Tidak dapat terhubung ke RadioBOSS di {base_url}. Pastikan RadioBOSS aktif dan Web Remote Control dinyalakan di menu Options -> Network.",
            )
        except httpx.TimeoutException:
            return RadioBOSSStatusResponse(
                connected=False,
                error=f"Koneksi ke RadioBOSS di {base_url} timeout.",
            )
        except Exception as e:
            logger.error(f"Error checking RadioBOSS status: {e}")
            return RadioBOSSStatusResponse(
                connected=False,
                error=f"Terjadi kesalahan koneksi RadioBOSS: {str(e)}",
            )

    def _parse_playback_info(self, xml_content: str) -> RadioBOSSStatusResponse:
        """Parse RadioBOSS playbackinfo XML safely."""
        try:
            root = ET.fromstring(xml_content)
            
            # Check for error status
            status_elem = root.find("status")
            if status_elem is not None and status_elem.text == "error":
                err_elem = root.find("error")
                err_code = err_elem.text if err_elem is not None else "Unknown error"
                return RadioBOSSStatusResponse(connected=False, error=f"RadioBOSS error: {err_code}")

            # Extract track metadata
            track_title = "Tidak ada lagu yang sedang diputar"
            track_artist = ""
            duration_str = "00:00"
            pos_str = "00:00"
            state = "stopped"
            listeners = 0

            # CurrentTrack
            current_track = root.find(".//CurrentTrack/TRACK")
            if current_track is not None:
                track_artist = current_track.attrib.get("ARTIST", "").strip()
                track_title = current_track.attrib.get("TITLE", "").strip()
                cast_title = current_track.attrib.get("CASTTITLE", "").strip()
                item_title = current_track.attrib.get("ITEMTITLE", "").strip()
                filename = current_track.attrib.get("FILENAME", "").strip()
                raw_duration = current_track.attrib.get("DURATION") or current_track.attrib.get("duration")
                duration_str = _format_time_string(raw_duration)

                if track_artist and track_title:
                    resolved_title = f"{track_artist} - {track_title}"
                elif cast_title and not cast_title.startswith("http://") and not cast_title.startswith("https://") and cast_title.lower() != "network stream":
                    resolved_title = cast_title
                elif item_title and not item_title.startswith("http://") and not item_title.startswith("https://") and item_title.lower() != "network stream":
                    resolved_title = item_title
                else:
                    resolved_title = track_title or ""

                # If resolved title is a URL, empty, or generic 'network stream', look up via video_id cache
                if (
                    not resolved_title
                    or resolved_title.startswith("http://")
                    or resolved_title.startswith("https://")
                    or resolved_title.lower() == "network stream"
                ):
                    target_url = filename or resolved_title
                    if "/api/stream/" in target_url:
                        vid = (
                            target_url.split("/api/stream/")[-1]
                            .replace(".mp3", "")
                            .split("?")[0]
                        )
                        try:
                            from app.services.ytdlp_service import ytdlp_service
                            cached_meta = ytdlp_service.get_track_metadata(vid)
                            c_artist = cached_meta.get("artist")
                            c_title = cached_meta.get("title")
                            if c_artist and c_title and c_title != "YouTube Audio":
                                resolved_title = f"{c_artist} - {c_title}"
                            elif c_title and c_title != "YouTube Audio":
                                resolved_title = c_title

                            if duration_str == "00:00" and cached_meta.get("duration_formatted"):
                                duration_str = cached_meta.get("duration_formatted")
                        except Exception:
                            pass

                # If still a file path or URL, extract from local filename
                if (
                    not resolved_title
                    or resolved_title.startswith("http://")
                    or resolved_title.startswith("https://")
                    or resolved_title.lower() == "network stream"
                ):
                    if filename and ("\\" in filename or "/" in filename or filename.endswith(".mp3")):
                        base = os.path.splitext(os.path.basename(filename))[0]
                        if not base.startswith("http") and base:
                            resolved_title = base

                if not resolved_title or resolved_title.startswith("http://") or resolved_title.startswith("https://"):
                    resolved_title = "Siaran Radio Caster Aktif"

                track_title = resolved_title

            # Playback element
            playback = root.find(".//Playback")
            if playback is not None:
                state = playback.attrib.get("state", "stopped")
                raw_pos = playback.attrib.get("pos")
                pos_str = _format_time_string(raw_pos)

                # Fallback to len attribute in Playback element if DURATION was 00:00 or missing
                raw_len = playback.attrib.get("len")
                if (duration_str == "00:00" or not duration_str) and raw_len:
                    duration_str = _format_time_string(raw_len)

            # Listeners
            listeners_elem = root.find(".//Listeners")
            if listeners_elem is not None:
                try:
                    listeners = int(listeners_elem.attrib.get("count", "0"))
                except ValueError:
                    listeners = 0

            now_playing = NowPlayingTrack(
                title=track_title or "Unknown Track",
                duration=duration_str,
                position=pos_str,
                status=state,
                listeners=listeners,
            )

            return RadioBOSSStatusResponse(
                connected=True,
                now_playing=now_playing,
                raw_status="OK",
            )

        except Exception as e:
            logger.error(f"Failed to parse RadioBOSS XML: {e}")
            return RadioBOSSStatusResponse(
                connected=True,
                now_playing=NowPlayingTrack(title="Memutar di RadioBOSS", status="active"),
                raw_status="Parse warning",
            )

    async def insert_track(
        self,
        filename: str,
        pos: int = -1,
        title: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Insert an audio stream into RadioBOSS playlist.
        action=inserttrack&filename={URL}&pos={POS}&streamingtitle={TITLE}
        pos: -1 for end of playlist, -2 for next track
        """
        base_url = self.settings.radioboss_base_url
        params = {
            "action": "inserttrack",
            "filename": filename,
            "pos": str(pos),
        }
        if title:
            params["streamingtitle"] = title
        if self.settings.RADIOBOSS_PASSWORD:
            params["pass"] = self.settings.RADIOBOSS_PASSWORD

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(base_url, params=params)

            if response.status_code == 401 or response.status_code == 403:
                return False, "Autentikasi gagal: Password RadioBOSS salah."

            if response.status_code != 200:
                return False, f"RadioBOSS mengembalikan status HTTP {response.status_code}"

            xml_text = response.text
            # Parse response
            try:
                root = ET.fromstring(xml_text)
                status_elem = root.find("status")
                result_elem = root.find("Result")

                status_val = status_elem.text if status_elem is not None else None
                result_val = result_elem.text if result_elem is not None else None

                if (status_val and status_val.lower() == "ok") or (result_val and result_val.lower() == "ok"):
                    return True, "Berhasil ditambahkan ke RadioBOSS"

                if status_val and status_val.lower() == "error":
                    err_elem = root.find("error")
                    err_msg = err_elem.text if err_elem is not None else "Gagal menyisipkan lagu."
                    return False, f"RadioBOSS Error: {err_msg}"
            except Exception:
                # If RadioBOSS returns plain text or unparseable XML but status is 200
                if "ok" in xml_text.lower():
                    return True, "Berhasil ditambahkan ke RadioBOSS"

            return True, "Lagu berhasil dikirim ke antrean RadioBOSS"

        except httpx.ConnectError:
            return False, f"Gagal terhubung ke RadioBOSS di {base_url}. Pastikan RadioBOSS aktif."
        except httpx.TimeoutException:
            return False, "Permintaan ke RadioBOSS mengalami timeout."
        except Exception as e:
            logger.error(f"Error inserting track into RadioBOSS: {e}")
    async def send_playback_command(self, action: str) -> Tuple[bool, str]:
        """
        Send playback transport control command to RadioBOSS.
        action: play, pause, stop, next
        """
        valid_actions = {"play", "pause", "stop", "next"}
        clean_action = action.strip().lower()
        if clean_action not in valid_actions:
            return False, f"Aksi '{action}' tidak valid. Pilihan: play, pause, stop, next."

        base_url = self.settings.radioboss_base_url
        params = {
            "cmd": clean_action,
        }
        if self.settings.RADIOBOSS_PASSWORD:
            params["pass"] = self.settings.RADIOBOSS_PASSWORD

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(base_url, params=params)

            if response.status_code in (401, 403):
                return False, "Autentikasi RadioBOSS gagal. Periksa password Web Remote."

            if response.status_code != 200:
                return False, f"RadioBOSS HTTP error {response.status_code}"

            action_labels = {
                "play": "Playback RadioBOSS dimulai",
                "pause": "Playback RadioBOSS dijeda",
                "stop": "Playback RadioBOSS dihentikan",
                "next": "Lagu berhasil dilewati (skip)",
            }
            return True, action_labels.get(clean_action, f"Perintah '{clean_action}' berhasil dijalankan.")

        except httpx.ConnectError:
            return False, f"Tidak dapat terhubung ke RadioBOSS di {base_url}."
        except Exception as e:
            logger.error(f"Error sending command '{clean_action}' to RadioBOSS: {e}")
            return False, f"Gagal mengeksekusi perintah: {e}"

    async def trigger_cart(self, cart_id: int) -> Tuple[bool, str]:
        """
        Trigger a Cart slot in RadioBOSS Cart wall via cmd=cart <cart_id>.
        cart_id: 1..8
        """
        base_url = self.settings.radioboss_base_url
        params = {
            "cmd": f"cart {cart_id}",
        }
        if self.settings.RADIOBOSS_PASSWORD:
            params["pass"] = self.settings.RADIOBOSS_PASSWORD

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(base_url, params=params)

            if response.status_code in (401, 403):
                return False, "Autentikasi gagal: Password RadioBOSS salah."
            if response.status_code != 200:
                return False, f"RadioBOSS HTTP error {response.status_code}"

            return True, f"Cart {cart_id} berhasil dipicu di RadioBOSS."
        except httpx.ConnectError:
            return False, f"Tidak dapat terhubung ke RadioBOSS di {base_url}."
        except Exception as e:
            logger.error(f"Error triggering Cart {cart_id}: {e}")
            return False, f"Gagal memicu Cart {cart_id}: {e}"

    async def stop_carts(self) -> Tuple[bool, str]:
        """Stop all playing carts in RadioBOSS via cmd=stopallcarts."""
        base_url = self.settings.radioboss_base_url
        params = {
            "cmd": "stopallcarts",
        }
        if self.settings.RADIOBOSS_PASSWORD:
            params["pass"] = self.settings.RADIOBOSS_PASSWORD

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(base_url, params=params)

            if response.status_code in (401, 403):
                return False, "Autentikasi gagal: Password RadioBOSS salah."
            if response.status_code != 200:
                return False, f"RadioBOSS HTTP error {response.status_code}"

            return True, "Semua jingle cart RadioBOSS dihentikan."
        except httpx.ConnectError:
            return False, f"Tidak dapat terhubung ke RadioBOSS di {base_url}."
        except Exception as e:
            logger.error(f"Error stopping carts: {e}")
            return False, f"Gagal menghentikan cart: {e}"

    async def set_cast_title(self, title: str) -> Tuple[bool, str]:
        """
        Update RadioBOSS on-air broadcast / streaming title live via cmd=setcasttitle.
        Instantly updates metadata sent to Icecast/Shoutcast encoders.
        """
        clean_title = title.strip()
        if not clean_title:
            return False, "Judul siaran tidak boleh kosong."

        base_url = self.settings.radioboss_base_url
        params = {
            "cmd": f"setcasttitle {clean_title}",
        }
        if self.settings.RADIOBOSS_PASSWORD:
            params["pass"] = self.settings.RADIOBOSS_PASSWORD

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(base_url, params=params)

            if response.status_code in (401, 403):
                return False, "Autentikasi gagal: Password RadioBOSS salah."
            if response.status_code != 200:
                return False, f"RadioBOSS HTTP error {response.status_code}"

            return True, f"Judul siaran berhasil diubah: '{clean_title}'"
        except httpx.ConnectError:
            return False, f"Tidak dapat terhubung ke RadioBOSS di {base_url}."
        except Exception as e:
            logger.error(f"Error setting cast title: {e}")
            return False, f"Gagal mengubah judul siaran: {e}"

    async def get_playlist(self, limit: int = 10) -> Tuple[bool, List[PlaylistItem], str]:
        """
        Fetch and parse playlist from RadioBOSS via ?action=getplaylist2.
        Returns upcoming scheduled tracks.
        """
        base_url = self.settings.radioboss_base_url
        params = {
            "action": "getplaylist2",
        }
        if self.settings.RADIOBOSS_PASSWORD:
            params["pass"] = self.settings.RADIOBOSS_PASSWORD

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(base_url, params=params)

            if response.status_code in (401, 403):
                return False, [], "Autentikasi gagal: Password RadioBOSS salah."

            if response.status_code != 200:
                return False, [], f"RadioBOSS HTTP error {response.status_code}"

            xml_text = response.text
            root = ET.fromstring(xml_text)

            tracks: List[PlaylistItem] = []
            for track_elem in root.findall(".//TRACK"):
                item_type = track_elem.attrib.get("ITEMTYPE", "").upper()
                # Exclude tracks already played
                if item_type == "TRACK_PLAYED":
                    continue

                artist = track_elem.attrib.get("ARTIST", "").strip()
                title = track_elem.attrib.get("TITLE", "").strip()
                cast_title = track_elem.attrib.get("CASTTITLE", "").strip()
                filename = track_elem.attrib.get("FILENAME", "").strip()
                duration = track_elem.attrib.get("DURATION", "00:00").strip()
                start_time = track_elem.attrib.get("STARTTIME", "").strip()

                try:
                    idx = int(track_elem.attrib.get("INDEX", "0"))
                except ValueError:
                    idx = len(tracks) + 1

                # Resolve display title
                if artist and title:
                    display_title = f"{artist} - {title}"
                elif cast_title and not cast_title.startswith("http://") and not cast_title.startswith("https://"):
                    display_title = cast_title
                else:
                    if filename:
                        base = os.path.splitext(os.path.basename(filename))[0]
                        if not base.startswith("http") and base:
                            display_title = base
                        else:
                            display_title = title or "Audio Stream"
                    else:
                        display_title = title or "Lagu RadioBOSS"

                # Check if this item is currently playing
                is_playing = (item_type == "TRACK_PLAYING")

                tracks.append(
                    PlaylistItem(
                        index=idx,
                        artist=artist,
                        title=title,
                        display_title=display_title,
                        duration=duration if duration != "––:––" else "00:00",
                        start_time=start_time,
                        filename=filename,
                        is_playing=is_playing,
                    )
                )

                if len(tracks) >= limit:
                    break

            return True, tracks, "OK"

        except httpx.ConnectError:
            return False, [], f"Tidak dapat terhubung ke RadioBOSS di {base_url}."
        except Exception as e:
            logger.error(f"Error fetching playlist from RadioBOSS: {e}")
            return False, [], f"Gagal membaca antrean playlist: {e}"


# Singleton instance
radioboss_service = RadioBOSSService()
