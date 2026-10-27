"""Smart Stream Relay Router: Serves cached Studio Master MP3 or transcodes YouTube audio stream for RadioBOSS."""
import logging
import os
import subprocess
import sys
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse, Response, FileResponse
from app.services.ytdlp_service import ytdlp_service
from app.services.cache_service import cache_service, _find_ffmpeg_binary
from app.services.settings_service import settings_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Stream Relay"])


@router.head("/stream/{video_id}")
@router.head("/stream/{video_id}.mp3")
def stream_audio_head(video_id: str):
    """Handle HEAD requests for browser audio players and RadioBOSS stream prober."""
    clean_id = video_id.replace(".mp3", "").strip()
    cached_path = cache_service.get_cached_file_by_id(clean_id)
    headers = {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache, no-store, must-revalidate",
    }
    if cached_path and os.path.isfile(cached_path):
        headers["Accept-Ranges"] = "bytes"
        headers["Content-Length"] = str(os.path.getsize(cached_path))
    else:
        headers["Accept-Ranges"] = "none"

    return Response(
        status_code=200,
        media_type="audio/mpeg",
        headers=headers,
    )


def _generate_mp3_stream(video_id: str):
    """
    Serve local cached Studio Master MP3 if available, or stream audio directly
    from YouTube CDN via local FFmpeg transcoding into 320kbps MP3.
    """
    clean_id = video_id.replace(".mp3", "").strip()

    # 1. Serve cached Studio Master MP3 file directly if available on disk
    cached_path = cache_service.get_cached_file_by_id(clean_id)
    if cached_path and os.path.isfile(cached_path):
        logger.info(f"Serving cached Studio Master MP3 for stream {clean_id}: {cached_path}")
        return FileResponse(
            path=cached_path,
            media_type="audio/mpeg",
            filename=os.path.basename(cached_path),
        )

    # 2. Live transcode relay from YouTube stream URL
    stream_url, headers = ytdlp_service.get_live_stream_details(clean_id)
    if not stream_url:
        logger.error(f"Failed to obtain audio stream for video_id: {clean_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio stream not found or unavailable.",
        )

    meta = ytdlp_service.get_track_metadata(clean_id)
    title = meta.get("title", "YouTube Audio")
    artist = meta.get("artist", "Radio Caster Bridge")
    album = meta.get("album", "Studio Stream")
    year = meta.get("year", "")
    genre = meta.get("genre", "Pop")

    ffmpeg_bin = _find_ffmpeg_binary()

    ffmpeg_cmd = [
        ffmpeg_bin,
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
    ]

    user_agent = headers.get("User-Agent") if headers else None
    if user_agent:
        ffmpeg_cmd.extend(["-user_agent", user_agent])

    cfg = settings_service.get_config()
    bitrate = getattr(cfg, "audio_quality", "320k") or "320k"
    if not str(bitrate).endswith("k"):
        bitrate = f"{bitrate}k"
    bitrate_num = str(bitrate).rstrip("k")

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
        "-b:a", str(bitrate),
        "-f", "mp3",
        "pipe:1",
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
