"""Recommendations Router: Smart Song Suggestions via YouTube Music & DJ Taste Engine."""
import logging
import time
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from app.schemas.track import TrackItem
from app.services.ytmusic_service import ytmusic_service
from app.services.db_service import db_service
from app.services.cache_service import cache_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/music", tags=["Smart Recommendations"])


def _format_relative_time(timestamp: Optional[float]) -> str:
    """Format Unix timestamp into a friendly human-readable relative string."""
    if not timestamp:
        return "Belum diputar"
    diff = int(time.time() - timestamp)
    if diff < 60:
        return "Baru saja"
    elif diff < 3600:
        mins = diff // 60
        return f"{mins} mnt lalu"
    elif diff < 86400:
        hours = diff // 3600
        return f"{hours} jam lalu"
    elif diff < 172800:
        return "Kemarin"
    else:
        days = diff // 86400
        return f"{days} hari lalu"


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


class CachedTrackItemResponse(BaseModel):
    video_id: str
    title: str
    artist: str = ""
    artists: List[str] = Field(default_factory=list)
    album: Optional[str] = None
    year: Optional[str] = None
    genre: Optional[str] = None
    thumbnail_url: Optional[str] = None
    url: str = ""
    file_path: Optional[str] = None
    file_size_bytes: int = 0
    file_size_mb: float = 0.0
    duration_seconds: int = 0
    duration_formatted: str = "00:00"
    play_count: int = 0
    last_played_at: Optional[float] = None
    last_played_relative: str = "Belum diputar"
    is_cached: bool = False
    rotation_status: Optional[str] = "light"  # heavy, medium, light
    rank: Optional[int] = None


class DJTopChartResponse(BaseModel):
    success: bool = True
    total_tracks: int = 0
    total_plays: int = 0
    chart: List[CachedTrackItemResponse] = []


class DJArtistStat(BaseModel):
    artist: str
    play_count: int
    track_count: int


class DJSmartRecommendationsResponse(BaseModel):
    success: bool = True
    top_artists: List[DJArtistStat] = []
    rotation_ready: List[CachedTrackItemResponse] = []
    affinity_recommendations: List[TrackItem] = []


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


@router.get("/dj/top-chart", response_model=DJTopChartResponse)
async def get_dj_top_chart(
    limit: int = Query(default=20, ge=1, le=50),
):
    """
    Get the Radio DJ's personal Top Chart ranking based on studio broadcast play counts.
    """
    try:
        # Sync disk cache if needed
        cache_service.sync_disk_cache()
        chart_rows = db_service.get_dj_top_chart(limit=limit)

        total_plays = sum((r.get("play_count") or 0) for r in chart_rows)
        chart_items: List[CachedTrackItemResponse] = []

        for row in chart_rows:
            size_b = row.get("file_size_bytes") or 0
            size_mb = round(size_b / (1024 * 1024), 2)
            last_p = row.get("last_played_at")
            art = row.get("artist") or ""
            chart_items.append(
                CachedTrackItemResponse(
                    video_id=row["video_id"],
                    title=row["title"],
                    artist=art,
                    artists=[art] if art else [],
                    album=row.get("album"),
                    year=row.get("year"),
                    genre=row.get("genre"),
                    thumbnail_url=row.get("thumbnail_url"),
                    url=f"https://music.youtube.com/watch?v={row['video_id']}",
                    file_path=row.get("file_path"),
                    file_size_bytes=size_b,
                    file_size_mb=size_mb,
                    duration_seconds=row.get("duration_seconds") or 0,
                    duration_formatted=row.get("duration_formatted") or "00:00",
                    play_count=row.get("play_count") or 0,
                    last_played_at=last_p,
                    last_played_relative=_format_relative_time(last_p),
                    is_cached=bool(row.get("is_cached")),
                    rotation_status=row.get("rotation_status") or "light",
                    rank=row.get("rank"),
                )
            )

        return DJTopChartResponse(
            success=True,
            total_tracks=len(chart_items),
            total_plays=total_plays,
            chart=chart_items,
        )
    except Exception as e:
        logger.error(f"Error fetching DJ top chart: {e}")
        raise HTTPException(status_code=500, detail="Gagal memuat tangga lagu DJ.")


@router.get("/dj/smart-recommendations", response_model=DJSmartRecommendationsResponse)
async def get_dj_smart_recommendations(
    limit: int = Query(default=8, ge=1, le=20),
):
    """
    Smart DJ Recommendation Engine:
    - Analyzes DJ's top artists by cumulative play counts.
    - Selects signature songs ready for airplay rotation (high plays, not played in last 90 mins).
    - Queries YouTube Music for fresh affinity studio songs matching the DJ's top artists.
    """
    try:
        cache_service.sync_disk_cache()
        top_artists_raw = db_service.get_dj_top_artists(limit=5)
        top_artists = [
            DJArtistStat(
                artist=a["artist"],
                play_count=a["play_count"],
                track_count=a["track_count"],
            )
            for a in top_artists_raw
        ]

        # Signature rotation tracks ready to spin
        rotation_rows = db_service.get_dj_rotation_candidates(limit=limit, cooldown_seconds=5400)
        rotation_ready: List[CachedTrackItemResponse] = []
        for idx, row in enumerate(rotation_rows, start=1):
            size_b = row.get("file_size_bytes") or 0
            last_p = row.get("last_played_at")
            art = row.get("artist") or ""
            rotation_ready.append(
                CachedTrackItemResponse(
                    video_id=row["video_id"],
                    title=row["title"],
                    artist=art,
                    artists=[art] if art else [],
                    album=row.get("album"),
                    year=row.get("year"),
                    genre=row.get("genre"),
                    thumbnail_url=row.get("thumbnail_url"),
                    url=f"https://music.youtube.com/watch?v={row['video_id']}",
                    file_path=row.get("file_path"),
                    file_size_bytes=size_b,
                    file_size_mb=round(size_b / (1024 * 1024), 2),
                    duration_seconds=row.get("duration_seconds") or 0,
                    duration_formatted=row.get("duration_formatted") or "00:00",
                    play_count=row.get("play_count") or 0,
                    last_played_at=last_p,
                    last_played_relative=_format_relative_time(last_p),
                    is_cached=bool(row.get("is_cached")),
                    rotation_status="medium" if idx <= 3 else "light",
                    rank=idx,
                )
            )

        # Fresh affinity songs from top artists
        affinity_recommendations: List[TrackItem] = []
        if top_artists:
            primary_artist = top_artists[0].artist
            try:
                artist_songs = ytmusic_service.get_artist_top_tracks(primary_artist, limit=6)
                # Exclude any video_id already present in rotation_ready
                existing_vids = {r.video_id for r in rotation_ready}
                affinity_recommendations = [s for s in artist_songs if s.video_id not in existing_vids]
            except Exception as e:
                logger.warning(f"Could not fetch artist affinity songs: {e}")

        return DJSmartRecommendationsResponse(
            success=True,
            top_artists=top_artists,
            rotation_ready=rotation_ready,
            affinity_recommendations=affinity_recommendations,
        )
    except Exception as e:
        logger.error(f"Error generating DJ smart recommendations: {e}")
        raise HTTPException(status_code=500, detail="Gagal menghasilkan rekomendasi DJ.")


@router.get("/cache/tracks", response_model=List[CachedTrackItemResponse])
async def get_cached_tracks(
    search: str = Query(default=""),
    only_cached: bool = Query(default=False),
    sort: str = Query(default="play_count"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """
    Get full list of locally cached and tracked songs with play statistics.
    """
    try:
        cache_service.sync_disk_cache()
        rows = db_service.get_cached_tracks(
            search=search,
            only_cached=only_cached,
            sort_by=sort,
            limit=limit,
        )
        results: List[CachedTrackItemResponse] = []
        for idx, row in enumerate(rows, start=1):
            size_b = row.get("file_size_bytes") or 0
            last_p = row.get("last_played_at")
            art = row.get("artist") or ""
            results.append(
                CachedTrackItemResponse(
                    video_id=row["video_id"],
                    title=row["title"],
                    artist=art,
                    artists=[art] if art else [],
                    album=row.get("album"),
                    year=row.get("year"),
                    genre=row.get("genre"),
                    thumbnail_url=row.get("thumbnail_url"),
                    url=f"https://music.youtube.com/watch?v={row['video_id']}",
                    file_path=row.get("file_path"),
                    file_size_bytes=size_b,
                    file_size_mb=round(size_b / (1024 * 1024), 2),
                    duration_seconds=row.get("duration_seconds") or 0,
                    duration_formatted=row.get("duration_formatted") or "00:00",
                    play_count=row.get("play_count") or 0,
                    last_played_at=last_p,
                    last_played_relative=_format_relative_time(last_p),
                    is_cached=bool(row.get("is_cached")),
                    rank=idx,
                )
            )
        return results
    except Exception as e:
        logger.error(f"Error fetching cached tracks: {e}")
        raise HTTPException(status_code=500, detail="Gagal mengambil daftar lagu cache.")
