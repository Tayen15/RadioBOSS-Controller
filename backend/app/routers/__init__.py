from .search import router as search_router
from .stream import router as stream_router
from .radioboss import router as radioboss_router
from .settings import router as settings_router
from .recommendations import router as recommendations_router
from .playlist_sets import router as playlist_sets_router
from .update import router as update_router

__all__ = [
    "search_router",
    "stream_router",
    "radioboss_router",
    "settings_router",
    "recommendations_router",
    "playlist_sets_router",
    "update_router",
]
