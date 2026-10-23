"""Main FastAPI Application Entrypoint with Standalone Static Frontend Support."""
import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from app.config import get_settings
from app.routers import (
    search_router,
    stream_router,
    radioboss_router,
    settings_router,
    recommendations_router,
    playlist_sets_router,
)
from app.version import VERSION

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("radio_bridge")


def find_frontend_out_dir() -> Optional[str]:
    """Locate bundled or development frontend/out directory."""
    # PyInstaller temporary extraction folder
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        for sub in ["frontend/out", "out"]:
            candidate = os.path.join(sys._MEIPASS, *sub.split("/"))
            if os.path.isdir(candidate) and os.path.isfile(os.path.join(candidate, "index.html")):
                return candidate

    # Project workspace directory candidates
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(current_dir)), "frontend", "out"),
        os.path.join(os.getcwd(), "frontend", "out"),
        os.path.join(os.getcwd(), "out"),
    ]
    for c in candidates:
        if os.path.isdir(c) and os.path.isfile(os.path.join(c, "index.html")):
            return c
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle event handler for application startup and shutdown."""
    settings = get_settings()
    logger.info("Starting Radio Caster Request Bridge...")
    logger.info(f"Target RadioBOSS URL: {settings.radioboss_base_url}")
    out_dir = find_frontend_out_dir()
    if out_dir:
        logger.info(f"Serving standalone static frontend from: {out_dir}")
    else:
        logger.info("Static frontend/out not found. Running in headless API mode.")
    yield
    logger.info("Shutting down Radio Caster Request Bridge.")


settings = get_settings()
app = FastAPI(
    title="Radio Caster Request Bridge API",
    description="Bridge connecting Radio Caster Dashboard with RadioBOSS and YouTube Music",
    version=VERSION,
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from starlette.requests import Request

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled server error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__}
    )

# Mount API Routers
app.include_router(search_router)
app.include_router(stream_router)
app.include_router(radioboss_router)
app.include_router(settings_router)
app.include_router(recommendations_router)
app.include_router(playlist_sets_router)


@app.get("/api/health", tags=["Health"])
async def health_check():
    """Health check endpoint to verify backend status."""
    return JSONResponse(
        content={
            "status": "online",
            "service": "Radio Caster Request Bridge",
            "version": VERSION,
        }
    )


# Mount Static Frontend if built
frontend_out = find_frontend_out_dir()
if frontend_out:
    app.mount("/", StaticFiles(directory=frontend_out, html=True), name="static_frontend")


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=True,
    )
