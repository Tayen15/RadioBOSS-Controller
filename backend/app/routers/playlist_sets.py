"""Playlist Sets Router: Caster Collection Presets & Playlist Batch Importer."""
import logging
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
import yt_dlp
from app.schemas.track import TrackItem
from app.services.db_service import db_service
from app.services.ytmusic_service import _format_seconds, _get_best_thumbnail

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sets", tags=["Playlist Sets"])


class CreateSetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default="", max_length=300)


class AddTrackRequest(BaseModel):
    track: TrackItem


class ResolvePlaylistRequest(BaseModel):
    url: str = Field(..., min_length=5)
    limit: Optional[int] = Field(default=50, ge=1, le=100)


class ResolvePlaylistResponse(BaseModel):
    success: bool = True
    title: str
    count: int
    tracks: List[TrackItem]


@router.get("")
async def get_all_playlist_sets():
    """Retrieve all playlist sets created by the caster."""
    try:
        sets = db_service.get_all_sets()
        return {"success": True, "sets": sets}
    except Exception as e:
        logger.error(f"Error fetching playlist sets: {e}")
        raise HTTPException(status_code=500, detail="Gagal mengambil daftar playlist set.")


@router.post("")
async def create_playlist_set(req: CreateSetRequest):
    """Create a new playlist set."""
    try:
        new_set = db_service.create_set(req.name, req.description or "")
        return {"success": True, "set": new_set}
    except Exception as e:
        logger.error(f"Error creating playlist set: {e}")
        raise HTTPException(status_code=500, detail="Gagal membuat playlist set.")


@router.get("/{set_id}")
async def get_playlist_set_details(set_id: str):
    """Retrieve details and all ordered tracks within a playlist set."""
    try:
        set_details = db_service.get_set_details(set_id)
        if not set_details:
            raise HTTPException(status_code=404, detail="Playlist set tidak ditemukan.")
        return {"success": True, "set": set_details}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching set details for {set_id}: {e}")
        raise HTTPException(status_code=500, detail="Gagal mengambil detail playlist set.")


@router.delete("/{set_id}")
async def delete_playlist_set(set_id: str):
    """Delete a playlist set and its items."""
    try:
        db_service.delete_set(set_id)
        return {"success": True, "message": "Playlist set berhasil dihapus."}
    except Exception as e:
        logger.error(f"Error deleting playlist set {set_id}: {e}")
        raise HTTPException(status_code=500, detail="Gagal menghapus playlist set.")


@router.post("/{set_id}/tracks")
async def add_track_to_playlist_set(set_id: str, req: AddTrackRequest):
    """Append a song into a playlist set."""
    try:
        # Check set exists
        s = db_service.get_set_details(set_id)
        if not s:
            raise HTTPException(status_code=404, detail="Playlist set tidak ditemukan.")

        result = db_service.add_track_to_set(set_id, req.track.model_dump())
        return {"success": True, "item": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding track to set {set_id}: {e}")
        raise HTTPException(status_code=500, detail="Gagal menambahkan lagu ke playlist set.")


@router.delete("/{set_id}/tracks/{item_id}")
async def remove_track_from_playlist_set(set_id: str, item_id: str):
    """Remove a song from a playlist set."""
    try:
        db_service.remove_track_from_set(set_id, item_id)
        return {"success": True, "message": "Lagu berhasil dihapus dari set."}
    except Exception as e:
        logger.error(f"Error removing track {item_id} from set {set_id}: {e}")
        raise HTTPException(status_code=500, detail="Gagal menghapus lagu dari playlist set.")


@router.post("/resolve-url", response_model=ResolvePlaylistResponse)
async def resolve_playlist_url(req: ResolvePlaylistRequest):
    """
    Resolve a YouTube or YouTube Music playlist / album link into a list of TrackItems.
    Allows caster to preview and queue entire playlists in bulk.
    """
    clean_url = req.url.strip()
    if not clean_url:
        raise HTTPException(status_code=400, detail="URL playlist tidak valid.")

    ydl_opts = {
        "extract_flat": True,
        "quiet": True,
        "skip_download": True,
        "playlistend": req.limit or 50,
        "ignoreerrors": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
            if not info:
                raise HTTPException(status_code=400, detail="Tidak dapat membaca link playlist.")

            playlist_title = info.get("title") or "YouTube Playlist"
            raw_entries = info.get("entries") or []

            tracks: List[TrackItem] = []
            for entry in raw_entries:
                if not entry:
                    continue
                v_id = entry.get("id") or entry.get("url")
                if not v_id:
                    continue

                raw_title = entry.get("title") or "Unknown Title"
                uploader = entry.get("uploader") or entry.get("channel") or ""

                # Parse "Artist - Title" if present
                if " - " in raw_title:
                    parts = raw_title.split(" - ", 1)
                    artists = [parts[0].strip()]
                    title = parts[1].strip()
                else:
                    artists = [uploader] if uploader else []
                    title = raw_title

                duration_sec = entry.get("duration") or 0
                thumbs = entry.get("thumbnails") or []
                thumbnail_url = _get_best_thumbnail(thumbs) if thumbs else None
                watch_url = f"https://music.youtube.com/watch?v={v_id}"

                tracks.append(
                    TrackItem(
                        video_id=v_id,
                        title=title,
                        artists=artists,
                        album=playlist_title,
                        duration_seconds=duration_sec,
                        duration_formatted=_format_seconds(duration_sec),
                        thumbnail_url=thumbnail_url,
                        url=watch_url,
                        year=None,
                        genre="Playlist Import",
                    )
                )

            return ResolvePlaylistResponse(
                success=True,
                title=playlist_title,
                count=len(tracks),
                tracks=tracks,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resolving playlist URL {clean_url}: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal memproses URL playlist: {str(e)}")
