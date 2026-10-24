"""Auto Update Router: Exposes endpoints for checking, downloading, and applying updates."""
import logging
from typing import Any, Dict
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.services.update_service import update_service

logger = logging.getLogger("update_router")

router = APIRouter(prefix="/api/update", tags=["Auto Update"])


@router.get("/check")
async def check_update(force: bool = Query(False, description="Paksa cek langsung ke server GitHub tanpa menggunakan cache")):
    """Check for latest application release from GitHub."""
    data = await update_service.check_for_updates(force=force)
    return JSONResponse(content=data)


@router.post("/download")
async def start_download():
    """Start downloading the matching update asset in the background."""
    res = await update_service.start_download()
    status_code = 200 if res.get("success") else 400
    return JSONResponse(status_code=status_code, content=res)


@router.get("/status")
async def get_download_status():
    """Get real-time download progress and status."""
    status = update_service.get_download_status()
    return JSONResponse(content=status)


@router.post("/apply")
async def apply_update():
    """Execute the downloaded installer and prepare application restart."""
    res = update_service.apply_update()
    status_code = 200 if res.get("success") else 400
    return JSONResponse(status_code=status_code, content=res)
