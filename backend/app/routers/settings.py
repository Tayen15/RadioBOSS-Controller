"""Settings API Router: In-app configuration management."""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.settings_service import settings_service, AppConfig
from app.services.radioboss_service import radioboss_service

from typing import List, Dict, Any
from app.services.cache_service import cache_service
from app.services.history_service import history_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Settings & Management"])


class SaveSettingsResponse(BaseModel):
    success: bool
    message: str
    connected: bool
    config: AppConfig


@router.get("/settings", response_model=AppConfig)
async def get_app_settings():
    """Retrieve currently stored application settings."""
    return settings_service.get_config()


@router.post("/settings", response_model=SaveSettingsResponse)
async def save_app_settings(config: AppConfig):
    """
    Save new settings to %APPDATA%/RadioBOSSCaster/config.json
    and immediately test connectivity with RadioBOSS.
    """
    try:
        updated = settings_service.update_config(config)

        # Test RadioBOSS connectivity immediately
        status_resp = await radioboss_service.check_status()
        is_connected = status_resp.connected

        if is_connected:
            msg = "Pengaturan berhasil disimpan dan koneksi ke RadioBOSS aktif!"
        else:
            msg = f"Pengaturan disimpan, namun RadioBOSS belum terhubung: {status_resp.error}"

        return SaveSettingsResponse(
            success=True,
            message=msg,
            connected=is_connected,
            config=updated,
        )
    except Exception as e:
        logger.error(f"Error saving settings: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan pengaturan: {str(e)}")


@router.get("/cache/stats")
async def get_cache_stats():
    """Retrieve cache directory path, file count, and total MB used."""
    return cache_service.get_cache_stats()


@router.post("/cache/open-folder")
async def open_cache_folder():
    """Open the local audio cache folder directly in Windows File Explorer."""
    success = cache_service.open_cache_folder()
    if not success:
        raise HTTPException(status_code=500, detail="Gagal membuka folder cache di File Explorer.")
    return {"success": True, "message": "Folder cache dibuka di Windows Explorer."}


@router.delete("/cache")
async def clear_audio_cache(days: Optional[int] = None):
    """
    Delete cached studio master audio files to free disk space.
    If days is given (e.g. days=7), only deletes files older than N days.
    """
    count = cache_service.clear_cache(older_than_days=days)
    desc = f"Lagu lebih lama dari {days} hari" if days else "Semua file cache"
    return {
        "success": True,
        "message": f"{desc} berhasil dibersihkan ({count} file dihapus).",
        "deleted_count": count,
    }


@router.post("/cache/trim")
async def trim_audio_cache():
    """
    Prune cache storage to stay within configured max_cache_size_mb limit.
    Deletes least-played songs first.
    """
    pruned = cache_service.enforce_cache_limit()
    stats = cache_service.get_cache_stats()
    return {
        "success": True,
        "message": f"Penyimpanan cache dipangkas ({pruned} file lama/jarang diputar dihapus).",
        "pruned_count": pruned,
        "stats": stats,
    }


@router.get("/history", response_model=List[Dict[str, Any]])
async def get_queue_history():
    """Retrieve persistent queue history from %APPDATA%/RadioBOSSCaster/history.json."""
    return history_service.get_history()


@router.post("/history")
async def add_queue_history(item: Dict[str, Any]):
    """Add or sync a track into persistent queue history."""
    return history_service.add_entry(item)


@router.delete("/history")
async def clear_queue_history():
    """Clear all saved queue history."""
    success = history_service.clear()
    return {"success": success, "message": "Riwayat request berhasil dibersihkan."}
