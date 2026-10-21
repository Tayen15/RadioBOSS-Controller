from .search import router as search_router
from .stream import router as stream_router
from .radioboss import router as radioboss_router
from .settings import router as settings_router

__all__ = ["search_router", "stream_router", "radioboss_router", "settings_router"]
