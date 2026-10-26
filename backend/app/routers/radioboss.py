import asyncio
import logging
import os
import time
from fastapi import APIRouter, HTTPException
from app.config import get_settings
from app.schemas.track import (
    QueueRequest,
    QueueResponse,
    RadioBOSSStatusResponse,
    PlaybackControlRequest,
    PlaybackControlResponse,
    PlaylistResponse,
    CartRequest,
    CartResponse,
    CastTitleRequest,
    CastTitleResponse,
)
from app.services.radioboss_service import radioboss_service
from app.services.ytdlp_service import ytdlp_service
from app.services.settings_service import settings_service
from app.services.cache_service import cache_service
from app.services.history_service import history_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["RadioBOSS"])


@router.get("/radioboss/status", response_model=RadioBOSSStatusResponse)
async def get_radioboss_status():
    """Check RadioBOSS connectivity and get live Now Playing info."""
    return await radioboss_service.check_status()


@router.post("/radioboss/playback", response_model=PlaybackControlResponse)
async def control_playback(request: PlaybackControlRequest):
    """Trigger playback transport controls (play, pause, stop, next)."""
    success, message = await radioboss_service.send_playback_command(request.action)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return PlaybackControlResponse(success=True, message=message, action=request.action)


@router.post("/radioboss/cart", response_model=CartResponse)
async def trigger_cart(request: CartRequest):
    """Trigger a Cart wall slot in RadioBOSS (cmd=cart <1..N>)."""
    success, message = await radioboss_service.trigger_cart(request.cart_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return CartResponse(success=True, message=message, cart_id=request.cart_id)


@router.post("/radioboss/cart/stop", response_model=CartResponse)
async def stop_all_carts():
    """Stop all playing soundboard carts in RadioBOSS."""
    success, message = await radioboss_service.stop_carts()
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return CartResponse(success=True, message=message)


@router.get("/radioboss/playlist", response_model=PlaylistResponse)
async def get_radioboss_playlist(limit: int = 10):
    """Get upcoming tracks in RadioBOSS playlist."""
    success, tracks, error = await radioboss_service.get_playlist(limit=limit)
    if not success:
        return PlaylistResponse(success=False, count=0, tracks=[], error=error)
    return PlaylistResponse(success=True, count=len(tracks), tracks=tracks)


@router.post("/radioboss/casttitle", response_model=CastTitleResponse)
async def set_radioboss_cast_title(request: CastTitleRequest):
    """
    Update RadioBOSS live on-air broadcast / streaming title.
    Directly updates the metadata received by streaming encoders (Icecast/Shoutcast).
    """
    success, message = await radioboss_service.set_cast_title(request.title)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return CastTitleResponse(success=True, message=message, title=request.title.strip())


@router.post("/queue", response_model=QueueResponse)
async def queue_track(request: QueueRequest):
    """
    Queue a track into RadioBOSS playlist.
    pos: -1 (append to end of playlist)
    pos: 1 (play next / immediately after active track)
    """
    settings = get_settings()

    clean_id = request.video_id.replace(".mp3", "").strip()
    meta = ytdlp_service.get_track_metadata(clean_id)

    # Parse artist and title with fallback from request
    raw_title = request.title.strip()
    if " - " in raw_title:
        p_artist, p_title = raw_title.split(" - ", 1)
        artist = request.artist or p_artist.strip()
        song_title = p_title.strip()
    else:
        artist = request.artist or meta.get("artist") or ""
        song_title = raw_title

    album = request.album or meta.get("album") or "Single"
    thumbnail_url = request.thumbnail_url or meta.get("thumbnail_url")
    year = request.year or meta.get("year") or ""
    genre = request.genre or meta.get("genre") or "Pop"

    # Cache metadata for stream relay and fallback search
    ytdlp_service._meta_cache[clean_id] = {
        "title": song_title,
        "artist": artist,
        "album": album,
        "thumbnail_url": thumbnail_url,
        "year": year,
        "genre": genre,
    }

    # Attempt to prepare a Studio Master Cached MP3 file with full ID3 tags & Artwork
    # This enables RadioBOSS to display full Track Info (Artist, Title, Album, Artwork, Duration)
    # in its bottom info panel and in "Coming up next" playlist
    cached_file = None
    try:
        cached_file = await asyncio.to_thread(
            cache_service.prepare_studio_cache,
            clean_id,
            song_title,
            artist,
            album,
            thumbnail_url,
            year,
            genre,
        )
    except Exception as e:
        logger.warning(f"Studio master cache generation failed: {e}")

    if cached_file and os.path.isfile(cached_file):
        target_filename = cached_file
        logger.info(f"Queuing local studio master MP3 with ID3 & artwork to RadioBOSS: {target_filename}")
    elif request.use_relay:
        # Verify stream is actually resolvable before sending relay URL to RadioBOSS
        # Prevents queuing a broken 'Network Stream' item that fails with BASS Error code 2
        stream_url, _ = await asyncio.to_thread(ytdlp_service.get_live_stream_details, clean_id)
        if not stream_url:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Gagal mengekstrak audio untuk '{artist} - {song_title}' dari YouTube "
                    f"(stream diblokir atau tidak tersedia). Coba pilih versi lagu lain dari hasil pencarian."
                ),
            )
        cfg = settings_service.get_config()
        active_port = cfg.server_port or settings.SERVER_PORT
        target_filename = f"http://{settings.SERVER_HOST}:{active_port}/api/stream/{clean_id}.mp3"
        logger.info(f"Queuing verified stream relay URL to RadioBOSS: {target_filename}")
    elif request.direct_stream_url:
        target_filename = request.direct_stream_url
    else:
        _, direct_url = await asyncio.to_thread(ytdlp_service.extract_track_info, clean_id)
        if not direct_url:
            raise HTTPException(
                status_code=400,
                detail="Tidak dapat mengekstrak audio stream untuk lagu ini.",
            )
        target_filename = direct_url

    # Format broadcast title according to user setting
    # None means 'radioboss_native' -> RadioBOSS will format using embedded ID3 tags
    streaming_title = settings_service.format_title(artist=artist, title=song_title)
    display_title = f"{artist} - {song_title}" if artist else song_title

    # In RadioBOSS API, pos=-2 inserts immediately after currently playing track
    target_pos = -2 if request.pos in (1, -2) else request.pos

    success, message = await radioboss_service.insert_track(
        filename=target_filename,
        pos=target_pos,
        title=streaming_title or display_title,
    )

    if not success:
        raise HTTPException(
            status_code=502,
            detail=message,
        )

    action_label = "berikutnya" if target_pos == -2 else "terakhir"

    # Automatically save to persistent server-side history (%APPDATA%/RadioBOSSCaster/history.json)
    try:
        import datetime
        now = datetime.datetime.now()
        time_str = now.strftime("%H:%M")
        history_entry = {
            "id": f"{int(time.time() * 1000)}-{clean_id}",
            "video_id": clean_id,
            "title": display_title,
            "artists": [artist] if artist else ["YouTube Music"],
            "thumbnail_url": meta.get("thumbnail_url"),
            "pos": request.pos,
            "timestamp": time_str,
            "status": "success",
            "isMasterCached": bool(cached_file and os.path.isfile(cached_file)),
        }
        history_service.add_entry(history_entry)
        from app.services.db_service import db_service
        db_service.record_track_play(
            video_id=clean_id,
            title=song_title or display_title,
            artist=artist,
            album=album,
            thumbnail_url=thumbnail_url,
            year=year,
            genre=genre,
        )
    except Exception as e:
        logger.warning(f"Failed to record history and play count: {e}")

    return QueueResponse(
        success=True,
        message=f"Lagu '{display_title}' berhasil ditambahkan ke antrean {action_label}.",
        inserted_pos=request.pos,
        track_title=display_title,
        stream_url=target_filename,
    )
