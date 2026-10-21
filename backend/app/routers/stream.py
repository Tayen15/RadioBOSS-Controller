"""Smart Stream Relay Router: Transcodes YouTube audio stream into broadcast-quality MP3 for RadioBOSS."""
import logging
import os
import shutil
import subprocess
import sys
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse, Response
from app.services.ytdlp_service import ytdlp_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Stream Relay"])


def _find_ffmpeg_binary() -> str:
    """Find ffmpeg executable in PATH, alongside exe, or in frozen bundle."""
    candidates = []

    # If packaged via PyInstaller
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        candidates.append(os.path.join(exe_dir, "ffmpeg.exe"))
        if hasattr(sys, "_MEIPASS"):
            candidates.append(os.path.join(sys._MEIPASS, "ffmpeg.exe"))

    # Local workspace and common deployment paths
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
    if which:
        return which

    return "ffmpeg"


@router.head("/stream/{video_id}")
@router.head("/stream/{video_id}.mp3")
def stream_audio_head(video_id: str):
    """Handle HEAD requests for browser audio players without spawning ffmpeg."""
    return Response(
        status_code=200,
        media_type="audio/mpeg",
        headers={
            "Content-Type": "audio/mpeg",
            "Accept-Ranges": "none",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


def _generate_mp3_stream(video_id: str):
    """
    Stream audio directly from YouTube CDN via local ffmpeg transcoding into pristine MP3.
    This eliminates the 'ftypdash' container issue so RadioBOSS decodes and plays instantly.
    """
    clean_id = video_id.replace(".mp3", "").strip()
    stream_url, headers = ytdlp_service.get_live_stream_details(clean_id)
    if not stream_url:
        logger.error(f"Failed to obtain audio stream for video_id: {clean_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio stream not found or unavailable."
        )

    # Retrieve track metadata for embedded ID3 tags
    meta = ytdlp_service.get_track_metadata(clean_id)
    title = meta.get("title", "YouTube Audio")
    artist = meta.get("artist", "Radio Caster Bridge")
    album = meta.get("album", "Studio Stream")
    year = meta.get("year", "")
    genre = meta.get("genre", "Pop")

    ffmpeg_bin = _find_ffmpeg_binary()

    # Build ffmpeg command with network reconnect and user-agent support
    ffmpeg_cmd = [
        ffmpeg_bin,
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
    ]

    user_agent = headers.get("User-Agent") if headers else None
    if user_agent:
        ffmpeg_cmd.extend(["-user_agent", user_agent])

    ffmpeg_cmd.extend([
        "-i", stream_url,
        "-vn",
        "-metadata", f"title={title}",
        "-metadata", f"artist={artist}",
        "-metadata", f"album={album}",
        "-metadata", f"date={year}",
        "-metadata", f"year={year}",
        "-metadata", f"genre={genre}",
        "-id3v2_version", "3",
        "-write_id3v1", "1",
        "-c:a", "libmp3lame",
        "-b:a", "320k",
        "-f", "mp3",
        "pipe:1"
    ])

    logger.info(f"Starting FFmpeg MP3 stream using '{ffmpeg_bin}' for {clean_id} ('{artist} - {title}')")

    def chunk_generator():
        popen_kwargs = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.DEVNULL,
            "bufsize": 65536,
        }
        if sys.platform == "win32":
            popen_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

        process = subprocess.Popen(ffmpeg_cmd, **popen_kwargs)
        try:
            while True:
                chunk = process.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        except Exception as e:
            logger.debug(f"Streaming interrupted for {clean_id}: {e}")
        finally:
            try:
                process.kill()
                process.wait()
            except Exception:
                pass
            logger.info(f"FFmpeg stream closed for {clean_id}")

    return StreamingResponse(
        chunk_generator(),
        media_type="audio/mpeg",
        headers={
            "Content-Type": "audio/mpeg",
            "Accept-Ranges": "none",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "icy-name": f"{artist} - {title}",
            "icy-genre": "RadioBOSS Request",
            "icy-br": "320",
        },
    )


@router.get("/stream/{video_id}")
def stream_audio_relay(video_id: str):
    """Stream audio with or without extension."""
    return _generate_mp3_stream(video_id)


@router.get("/stream/{video_id}.mp3")
def stream_audio_relay_mp3(video_id: str):
    """Stream audio explicitly formatted as MP3 for RadioBOSS."""
    return _generate_mp3_stream(video_id)
