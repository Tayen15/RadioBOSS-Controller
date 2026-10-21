"""App Settings Service: Manages configuration in %APPDATA%/RadioBOSSCaster/config.json."""
import json
import logging
import os
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class AppConfig(BaseModel):
    """Configuration model stored in %APPDATA%/RadioBOSSCaster/config.json."""
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


def _get_appdata_dir() -> Path:
    """Return the Windows %APPDATA% directory for RadioBOSSCaster."""
    appdata = os.environ.get("APPDATA")
    if appdata:
        base_path = Path(appdata)
    else:
        base_path = Path.home() / "AppData" / "Roaming"
    config_dir = base_path / "RadioBOSSCaster"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


class SettingsService:
    """Service to load, cache, and save app configuration."""

    def __init__(self):
        self.config_file = _get_appdata_dir() / "config.json"
        self._config = self._load()

    def _load(self) -> AppConfig:
        """Load settings from config.json or migrate from existing .env/defaults."""
        if self.config_file.exists():
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return AppConfig(**data)
            except Exception as e:
                logger.error(f"Failed to read {self.config_file}: {e}. Using defaults.")

        # If config.json doesn't exist, check existing .env as initial values
        initial = AppConfig()
        env_file = Path(".env")
        if env_file.exists():
            try:
                from dotenv import dotenv_values
                vals = dotenv_values(env_file)
                if vals.get("RADIOBOSS_HOST"):
                    initial.radioboss_host = vals["RADIOBOSS_HOST"]
                if vals.get("RADIOBOSS_PORT"):
                    initial.radioboss_port = int(vals["RADIOBOSS_PORT"])
                if vals.get("RADIOBOSS_PASSWORD"):
                    initial.radioboss_password = vals["RADIOBOSS_PASSWORD"]
            except Exception:
                pass

        self._save(initial)
        return initial

    def _save(self, config: AppConfig):
        """Save settings to disk."""
        try:
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(config.model_dump(), f, indent=2)
            logger.info(f"Saved configuration to {self.config_file}")
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")

    def get_config(self) -> AppConfig:
        """Get currently active configuration."""
        return self._config

    def update_config(self, new_config: AppConfig) -> AppConfig:
        """Update and persist configuration."""
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
