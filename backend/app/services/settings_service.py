"""App Settings Service: Manages configuration in %APPDATA%/RadioBOSSCaster/config.json."""
import json
import logging
import os
from pathlib import Path
from typing import Optional, List
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class AppConfig(BaseModel):
    """Configuration model stored in SQLite database and %APPDATA%/RadioBOSSCaster/config.json."""
    radioboss_host: str = Field(default="http://127.0.0.1")
    radioboss_port: int = Field(default=9000)
    radioboss_password: str = Field(default="")
    title_format_mode: str = Field(
        default="radioboss_native",
        description="'radioboss_native', 'artist_title', 'title_artist', 'title_only', or 'custom'"
    )
    custom_title_format: str = Field(default="{artist} - {title}")
    server_port: int = Field(default=8000)
    enable_loudnorm: bool = Field(
        default=True,
        description="Enable EBU R128 loudness normalization (-14 LUFS) for broadcast audio"
    )
    custom_cache_dir: str = Field(
        default="",
        description="Custom directory for audio cache files (e.g. D:\\RadioCache). Defaults to %APPDATA%/RadioBOSSCaster/cache"
    )
    custom_data_dir: str = Field(
        default="",
        description="Custom directory for database & app data (e.g. D:\\RadioBOSS-Data). Defaults to %APPDATA%/RadioBOSSCaster"
    )
    max_cache_size_mb: int = Field(
        default=2048,
        description="Maximum storage cache size in MB (e.g. 500, 1024, 2048, 5120, 10240, or 0 for unlimited)"
    )
    auto_cleanup_cache: bool = Field(
        default=True,
        description="Automatically evict least-played songs when cache size limit is reached"
    )
    audio_quality: str = Field(
        default="320k",
        description="Audio transcode bitrate: '128k', '192k', '256k', or '320k'"
    )
    target_playlist_tab: str = Field(
        default="",
        description="Target RadioBOSS playlist tab name (empty for active tab)"
    )
    available_playlist_tabs: List[str] = Field(
        default_factory=list,
        description="List of playlist tab names available in RadioBOSS"
    )



def _get_appdata_dir() -> Path:
    """Return active app storage directory (supports Portable Mode, custom pointers, and Linux)."""
    from app.services.db_service import _resolve_active_storage_dir
    return _resolve_active_storage_dir()


class SettingsService:
    """Service to load, cache, and save app configuration via SQLite db_service."""

    def __init__(self):
        from app.services.db_service import db_service
        self.db = db_service
        self.config_file = _get_appdata_dir() / "config.json"
        self._config = self._load()

    def _load(self) -> AppConfig:
        """Load settings from SQLite database or fallback to config.json/defaults."""
        try:
            saved_dict = self.db.get_all_settings()
            if saved_dict:
                # Merge with AppConfig schema
                cfg = AppConfig(**saved_dict)
                # Keep active data dir in config
                if str(self.db.storage_dir) != str(_get_appdata_dir()):
                    cfg.custom_data_dir = str(self.db.storage_dir)
                return cfg
        except Exception as e:
            logger.warning(f"Could not load settings from SQLite: {e}")

        # Fallback to legacy config.json
        if self.config_file.exists():
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    cfg = AppConfig(**data)
                    self._save(cfg)
                    return cfg
            except Exception as e:
                logger.error(f"Failed to read {self.config_file}: {e}. Using defaults.")

        initial = AppConfig()
        self._save(initial)
        return initial

    def _save(self, config: AppConfig):
        """Save settings to SQLite database and mirror to config.json."""
        try:
            # 1. Save to SQLite
            self.db.save_all_settings(config.model_dump())
            # 2. Mirror to config.json for external inspections
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(config.model_dump(), f, indent=2)
            logger.info("Saved configuration to SQLite database and mirrored to config.json")
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")

    def get_config(self) -> AppConfig:
        """Get currently active configuration."""
        return self._config

    def update_config(self, new_config: AppConfig) -> AppConfig:
        """Update and persist configuration, relocating storage if requested."""
        if new_config.custom_data_dir != self._config.custom_data_dir:
            logger.info(f"Relocating database storage from {self._config.custom_data_dir} to {new_config.custom_data_dir}")
            self.db.relocate_storage(new_config.custom_data_dir)

        self._config = new_config
        self._save(new_config)
        return self._config

    def format_title(self, artist: str, title: str) -> Optional[str]:
        """
        Format broadcast title according to title_format_mode.
        Returns None if 'radioboss_native' (letting RadioBOSS format using embedded ID3 tags).
        """
        clean_artist = artist.strip() if artist else ""
        clean_title = title.strip() if title else ""
        mode = self._config.title_format_mode

        if mode == "radioboss_native" or mode == "artist_title":
            # Match RadioBOSS default %artist - %title format
            return f"{clean_artist} - {clean_title}" if clean_artist else clean_title
        elif mode == "title_artist":
            return f"{clean_title} - {clean_artist}" if clean_artist else clean_title
        elif mode == "title_only":
            return clean_title
        elif mode == "custom":
            try:
                return self._config.custom_title_format.format(
                    artist=clean_artist,
                    title=clean_title
                )
            except Exception:
                return f"{clean_artist} - {clean_title}"

        return f"{clean_artist} - {clean_title}" if clean_artist else clean_title


settings_service = SettingsService()
