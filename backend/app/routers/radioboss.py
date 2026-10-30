import asyncio
import logging
import os
import time
from typing import Optional
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
    SwitchTabRequest,
    SwitchTabResponse,
    TabsResponse,
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
async def get_radioboss_playlist(limit: int = 50, tab: Optional[str] = None):
    """Get upcoming tracks in RadioBOSS playlist (optionally from a specific tab)."""
    if tab and tab.strip():
        try:
            await radioboss_service.switch_playlist_tab(tab.strip())
            await asyncio.sleep(0.06)
        except Exception as e:
            logger.warning(f"Could not switch tab to {tab}: {e}")
    success, tracks, error = await radioboss_service.get_playlist(limit=limit)
    if not success:
        return PlaylistResponse(success=False, count=0, tracks=[], error=error)
    return PlaylistResponse(success=True, count=len(tracks), tracks=tracks)


@router.post("/radioboss/tab", response_model=SwitchTabResponse)
async def switch_radioboss_tab(request: SwitchTabRequest):
    """Switch active playlist tab in RadioBOSS (cmd=playlist <tab_name>)."""
    success, message = await radioboss_service.switch_playlist_tab(request.tab_name)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return SwitchTabResponse(success=True, message=message, active_tab=request.tab_name)


@router.get("/radioboss/tabs", response_model=TabsResponse)
async def get_radioboss_tabs():
    """Discover available and active playlist tabs in RadioBOSS."""
    tabs, active_tab, active_idx, is_synced = await radioboss_service.get_tabs_info()
    return TabsResponse(
        success=True,
        active_tab=active_tab,
        active_index=active_idx,
        available_tabs=tabs,
        is_synced=is_synced,
    )


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

    is_local_rb = radioboss_service.is_local_instance()

    # Determine target filename or network stream URL
    if is_local_rb and cached_file and os.path.isfile(cached_file):
        # Local RadioBOSS can directly open local filesystem cached MP3
        target_filename = cached_file
        logger.info(f"Queuing local studio master MP3 with ID3 & artwork to RadioBOSS: {target_filename}")
    elif request.use_relay or not is_local_rb:
        # Remote RadioBOSS or local using relay:
        # If not cached on disk, verify stream can be extracted before queuing
        if not (cached_file and os.path.isfile(cached_file)):
            stream_url, _ = await asyncio.to_thread(ytdlp_service.get_live_stream_details, clean_id)
            if not stream_url:
                raise HTTPException(
                    status_code=502,
                    detail=(
                        f"Gagal mengekstrak audio untuk '{artist} - {song_title}' dari YouTube "
                        f"(stream diblokir atau tidak tersedia). Coba pilih versi lagu lain dari hasil pencarian."
                    ),
                )
        target_filename = radioboss_service.get_reachable_stream_url(clean_id)
        logger.info(
            f"Queuing reachable stream relay URL to RadioBOSS ({'remote' if not is_local_rb else 'relay'}): {target_filename}"
        )
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

    # Determine target_pos based on RadioBOSS playback state:
    # If user requests "Play Next" (pos=1 or -2):
    #   - If RadioBOSS is actively playing: use pos=-2 (insert after playing track).
    #   - If RadioBOSS is stopped / idle: use pos=1 (insert at top of playlist so it plays first).
    # If user requests "Bottom / Append" (pos=-1): use pos=-1.
    if request.pos in (1, -2):
        try:
            rb_status = await radioboss_service.check_status()
            is_playing = bool(
                rb_status.connected
                and rb_status.now_playing
                and rb_status.now_playing.status == "playing"
            )
            target_pos = -2 if is_playing else 1
        except Exception:
            target_pos = 1
    else:
        target_pos = request.pos

    # If specific target playlist tab requested or configured, switch to that tab in RadioBOSS first
    target_tab = request.target_tab or settings_service.get_config().target_playlist_tab
    if target_tab and target_tab.strip():
        try:
            await radioboss_service.switch_playlist_tab(target_tab.strip())
            await asyncio.sleep(0.08)
        except Exception as e:
            logger.warning(f"Could not switch to target playlist tab '{target_tab}': {e}")

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
