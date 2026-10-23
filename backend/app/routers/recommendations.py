"""Recommendations Router: Smart Song Suggestions via YouTube Music."""
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.schemas.track import TrackItem
from app.services.ytmusic_service import ytmusic_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/music", tags=["Smart Recommendations"])


class RecommendationsResponse(BaseModel):
    success: bool = True
    seed_video_id: str
    results: List[TrackItem]


class ArtistTopTracksResponse(BaseModel):
    success: bool = True
    artist: str
    results: List[TrackItem]


class MoodTracksResponse(BaseModel):
    success: bool = True
    mood: str
    results: List[TrackItem]


@router.get("/recommendations/{video_id}", response_model=RecommendationsResponse)
async def get_recommendations(
    video_id: str,
    limit: int = Query(default=8, ge=1, le=25),
):
    """
    Get smart song recommendations (Up Next / Infinite Radio) based on a seed song.
    Powered by YouTube Music watch playlist matching algorithms.
    """
    try:
        results = ytmusic_service.get_recommendations(video_id, limit=limit)
        return RecommendationsResponse(
            success=True,
            seed_video_id=video_id,
            results=results,
        )
    except Exception as e:
        logger.error(f"Error fetching recommendations for {video_id}: {e}")
        raise HTTPException(status_code=500, detail="Gagal mengambil rekomendasi lagu.")


@router.get("/artist-top", response_model=ArtistTopTracksResponse)
async def get_artist_top_tracks(
    artist: str = Query(..., min_length=1),
    limit: int = Query(default=6, ge=1, le=20),
):
    """
    Get top popular songs for a specific artist.
    """
    try:
        results = ytmusic_service.get_artist_top_tracks(artist, limit=limit)
        return ArtistTopTracksResponse(
            success=True,
            artist=artist,
            results=results,
        )
    except Exception as e:
        logger.error(f"Error fetching top tracks for artist '{artist}': {e}")
        raise HTTPException(status_code=500, detail="Gagal mengambil lagu populer artis.")


@router.get("/mood", response_model=MoodTracksResponse)
async def get_mood_tracks(
    mood: str = Query(..., min_length=1),
    limit: int = Query(default=8, ge=1, le=25),
):
    """
    Get curated mood & vibe radio tracks (e.g. 'indonesia pop hits', 'chill acoustic', 'semangat pagi').
    """
    try:
        results = ytmusic_service.search_songs(mood, limit=limit)
        return MoodTracksResponse(
            success=True,
            mood=mood,
            results=results,
        )
    except Exception as e:
        logger.error(f"Error fetching mood tracks for '{mood}': {e}")
        raise HTTPException(status_code=500, detail="Gagal mengambil lagu kategori mood.")
