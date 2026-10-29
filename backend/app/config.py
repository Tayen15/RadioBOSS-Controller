"""Configuration management bridging Pydantic Settings and AppData settings_service."""
from typing import List
from app.services.settings_service import settings_service


class DynamicSettings:
    """Settings interface that reads dynamically from settings_service."""

    SERVER_HOST: str = "0.0.0.0"
    CORS_ORIGINS: str = "*"

    @property
    def RADIOBOSS_HOST(self) -> str:
        return settings_service.get_config().radioboss_host

    @property
    def RADIOBOSS_PORT(self) -> int:
        return settings_service.get_config().radioboss_port

    @property
    def RADIOBOSS_PASSWORD(self) -> str:
        return settings_service.get_config().radioboss_password

    @property
    def SERVER_PORT(self) -> int:
        return settings_service.get_config().server_port

    @property
    def cors_origins_list(self) -> List[str]:
        return ["*"]

    @property
    def radioboss_base_url(self) -> str:
        """Construct full RadioBOSS base HTTP URL."""
        host = self.RADIOBOSS_HOST.rstrip("/")
        if ":" in host.replace("http://", "").replace("https://", ""):
            return f"{host}/"
        return f"{host}:{self.RADIOBOSS_PORT}/"


_dynamic_settings = DynamicSettings()


def get_settings() -> DynamicSettings:
    """Return dynamic Settings instance."""
    return _dynamic_settings
