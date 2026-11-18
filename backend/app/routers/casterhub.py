"""CasterHub API Router: Bridges local studio app with CasterHub Cloud (charts, telemetry, crowd metadata, listener requests)."""
import logging
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.telemetry_service import telemetry_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/casterhub", tags=["CasterHub Cloud"])


class RequestActionBody(BaseModel):
    request_id: str
    action: str = "accept"


@router.get("/charts")
async def get_casterhub_charts(category: str = "top50", limit: int = 25):
    """Fetch Global Radio Charts (top50, trending, morning, afternoon, night) with SQLite cache fallback."""
    tracks = await telemetry_service.get_global_charts(category=category, limit=limit)
    return {"success": True, "category": category, "tracks": tracks}


@router.get("/stats")
async def get_casterhub_stats():
    """Return local studio session/lifetime airtime stats and live CasterHub network pulse."""
    session_stats = telemetry_service.get_session_stats()
    network_pulse = await telemetry_service.get_network_pulse()
    return {
        "success": True,
        "station_hash": telemetry_service.station_hash,
        "session": session_stats,
        "network": network_pulse.get("stats", {}),
        "live_ticker": network_pulse.get("live_ticker", []),
    }


@router.get("/metadata/clean")
async def get_crowd_clean_title(video_id: str, title: str = "", artist: str = ""):
    """Look up crowd-cleaned title & artist suggestion from CasterHub."""
    result = await telemetry_service.get_crowd_clean_metadata(
        video_id=video_id,
        title=title,
        artist=artist,
    )
    return {"success": True, "metadata": result}


@router.get("/requests")
async def get_listener_requests(status: str = "pending"):
    """Fetch incoming listener song requests for this station."""
    items = await telemetry_service.get_station_listener_requests(status=status)
    return {"success": True, "requests": items}


@router.post("/requests/action")
async def action_listener_request(body: RequestActionBody):
    """Accept, reject, or mark played a listener song request."""
    ok = await telemetry_service.action_listener_request(
        request_id=body.request_id,
        action=body.action,
    )
    return {"success": ok}


@router.post("/sync")
async def trigger_telemetry_sync():
    """Manually trigger background telemetry & airtime sync to CasterHub."""
    ok = await telemetry_service.sync_outbox_to_casterhub()
    return {"success": ok}
