"""Auto Update Service: Checks for latest releases on GitHub, downloads updates, and applies installers."""
import asyncio
import logging
import os
import platform
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.version import VERSION

logger = logging.getLogger("update_service")

GITHUB_REPO = "Tayen15/RadioBOSS-Controller"
API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"


def parse_semver(ver_str: str) -> Tuple[int, ...]:
    """Parse a version string (e.g. 'v0.5.2' or '0.5.2-beta') into an integer tuple for comparison."""
    clean = ver_str.strip().lstrip("vV")
    clean = clean.split("-")[0].split("+")[0]
    parts = []
    for p in clean.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


class UpdateService:
    def __init__(self):
        self._cached_release: Optional[Dict[str, Any]] = None
        self._last_checked_time: float = 0.0
        self._cache_ttl_seconds: float = 900.0  # 15 minutes cache

        self._lock = threading.Lock()
        self._download_task: Optional[asyncio.Task] = None
        self._download_state: Dict[str, Any] = {
            "status": "idle",  # idle, downloading, downloaded, error
            "progress": 0.0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "speed_mbps": 0.0,
            "file_path": None,
            "file_name": None,
            "error": None,
        }

    def _select_matching_asset(self, assets: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Choose the optimal release asset according to OS and architecture."""
        is_windows = sys.platform == "win32"
        is_linux = sys.platform.startswith("linux")
        is_64bit = sys.maxsize > 2**32 or "64" in platform.machine()

        if is_windows:
            if is_64bit:
                priority = [
                    "RadioBOSSCaster-Setup-x64.exe",
                    "RadioBOSSCaster-Windows-x64.exe",
                    "RadioBOSSCaster-Portable-Windows-x64.zip",
                    "RadioBOSSCaster.exe",
                ]
            else:
                priority = [
                    "RadioBOSSCaster-Setup-x86.exe",
                    "RadioBOSSCaster-Windows-x86.exe",
                    "RadioBOSSCaster-Portable-Windows-x86.zip",
                ]
        elif is_linux:
            priority = [
                "RadioBOSSCaster-Portable-Linux-x64.tar.gz",
                "RadioBOSSCaster-Linux-x64",
            ]
        else:
            priority = ["RadioBOSSCaster-Setup-x64.exe", "RadioBOSSCaster.exe"]

        asset_map = {a.get("name"): a for a in assets if a.get("name")}
        for candidate in priority:
            if candidate in asset_map:
                return asset_map[candidate]

        # Fallback to any exe or zip
        for a in assets:
            name = a.get("name", "").lower()
            if is_windows and name.endswith(".exe"):
                return a
            if is_linux and "linux" in name:
                return a

        return assets[0] if assets else None

    async def check_for_updates(self, force: bool = False) -> Dict[str, Any]:
        """Query GitHub Releases API and determine if a newer version is available."""
        now = time.time()
        if not force and self._cached_release and (now - self._last_checked_time < self._cache_ttl_seconds):
            logger.info("Returning cached GitHub release check info.")
            return self._cached_release

        headers = {
            "User-Agent": f"RadioBOSSCaster/{VERSION}",
            "Accept": "application/vnd.github.v3+json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(API_URL, headers=headers)
                if resp.status_code == 404:
                    result = {
                        "current_version": VERSION,
                        "latest_version": VERSION,
                        "update_available": False,
                        "release_name": "Belum ada rilis resmi",
                        "release_notes": "",
                        "published_at": "",
                        "html_url": f"https://github.com/{GITHUB_REPO}",
                        "asset": None,
                    }
                    self._cached_release = result
                    self._last_checked_time = now
                    return result

                resp.raise_for_status()
                data = resp.json()

            tag_name = data.get("tag_name", "").strip()
            raw_latest = tag_name.lstrip("vV")

            current_ver_tuple = parse_semver(VERSION)
            latest_ver_tuple = parse_semver(raw_latest)

            is_available = latest_ver_tuple > current_ver_tuple

            chosen_asset = self._select_matching_asset(data.get("assets", []))
            asset_info = None
            if chosen_asset:
                asset_info = {
                    "name": chosen_asset.get("name"),
                    "size": chosen_asset.get("size", 0),
                    "download_url": chosen_asset.get("browser_download_url"),
                    "content_type": chosen_asset.get("content_type", ""),
                }

            result = {
                "current_version": VERSION,
                "latest_version": raw_latest or VERSION,
                "tag_name": tag_name,
                "update_available": is_available,
                "release_name": data.get("name") or f"Versi {raw_latest}",
                "release_notes": data.get("body") or "",
                "published_at": data.get("published_at") or "",
                "html_url": data.get("html_url") or f"https://github.com/{GITHUB_REPO}/releases",
                "asset": asset_info,
            }

            self._cached_release = result
            self._last_checked_time = now
            return result

        except Exception as e:
            logger.warning(f"Error checking GitHub updates: {e}")
            return {
                "current_version": VERSION,
                "latest_version": VERSION,
                "update_available": False,
                "release_name": "Gagal terhubung ke server pembaruan",
                "release_notes": "",
                "published_at": "",
                "html_url": f"https://github.com/{GITHUB_REPO}/releases",
                "asset": None,
                "error": str(e),
            }

    def get_download_status(self) -> Dict[str, Any]:
        """Return current download progress and status."""
        with self._lock:
            return dict(self._download_state)

    async def start_download(self) -> Dict[str, Any]:
        """Initiate background download of the selected asset."""
        with self._lock:
            if self._download_state["status"] == "downloading":
                return {"success": True, "message": "Proses unduhan sedang berlangsung."}

            if self._download_state["status"] == "downloaded" and self._download_state.get("file_path"):
                if os.path.isfile(self._download_state["file_path"]):
                    return {"success": True, "message": "Pembaruan sudah siap dipasang."}

            self._download_state = {
                "status": "downloading",
                "progress": 0.0,
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "speed_mbps": 0.0,
                "file_path": None,
                "file_name": None,
                "error": None,
            }

        check_res = await self.check_for_updates(force=False)
        asset = check_res.get("asset")
        if not asset or not asset.get("download_url"):
            with self._lock:
                self._download_state["status"] = "error"
                self._download_state["error"] = "File installer pembaruan tidak ditemukan di rilis GitHub."
            return {"success": False, "message": self._download_state["error"]}

        asyncio.create_task(self._download_worker(asset["download_url"], asset["name"], asset.get("size", 0)))
        return {"success": True, "message": "Unduhan pembaruan dimulai."}

    async def _download_worker(self, url: str, filename: str, expected_size: int):
        """Asynchronous worker that streams download with progress updates."""
        temp_dir = os.path.join(tempfile.gettempdir(), "RadioBOSSCaster-Update")
        os.makedirs(temp_dir, exist_ok=True)
        dest_path = os.path.join(temp_dir, filename)

        logger.info(f"Downloading update asset from {url} to {dest_path}")
        start_time = time.time()
        downloaded = 0

        try:
            headers = {"User-Agent": f"RadioBOSSCaster/{VERSION}"}
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                async with client.stream("GET", url, headers=headers) as resp:
                    resp.raise_for_status()
                    total = int(resp.headers.get("content-length", expected_size or 0))

                    with open(dest_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            if chunk:
                                f.write(chunk)
                                downloaded += len(chunk)
                                elapsed = time.time() - start_time
                                speed = (downloaded / (1024 * 1024)) / (elapsed if elapsed > 0.1 else 0.1)
                                progress = (downloaded / total * 100.0) if total > 0 else 0.0

                                with self._lock:
                                    self._download_state["downloaded_bytes"] = downloaded
                                    self._download_state["total_bytes"] = total
                                    self._download_state["progress"] = round(min(100.0, progress), 1)
                                    self._download_state["speed_mbps"] = round(speed, 2)
                                    self._download_state["file_name"] = filename

            with self._lock:
                self._download_state["status"] = "downloaded"
                self._download_state["progress"] = 100.0
                self._download_state["file_path"] = dest_path
                self._download_state["file_name"] = filename
            logger.info(f"Update asset successfully downloaded: {dest_path} ({downloaded} bytes)")

        except Exception as e:
            logger.exception(f"Error downloading update asset: {e}")
            with self._lock:
                self._download_state["status"] = "error"
                self._download_state["error"] = str(e)
            if os.path.isfile(dest_path):
                try:
                    os.remove(dest_path)
                except Exception:
                    pass

    def apply_update(self) -> Dict[str, Any]:
        """Launch the downloaded installer or updater and exit application gracefully."""
        status = self.get_download_status()
        file_path = status.get("file_path")
        if not file_path or not os.path.isfile(file_path):
            return {"success": False, "message": "File installer belum diunduh atau tidak ditemukan."}

        logger.info(f"Applying update with file: {file_path}")

        try:
            if sys.platform == "win32":
                if file_path.lower().endswith(".exe"):
                    # Launch installer in detached background process
                    DETACHED_PROCESS = 0x00000008
                    CREATE_NEW_PROCESS_GROUP = 0x00000200
                    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
                    subprocess.Popen([file_path], creationflags=flags, close_fds=True)
                elif file_path.lower().endswith(".zip"):
                    # Open Explorer directory with the zip highlighted
                    subprocess.Popen(f'explorer.exe /select,"{file_path}"')
                else:
                    os.startfile(file_path)
            else:
                # Linux: Make executable and launch or open directory
                try:
                    os.chmod(file_path, 0o755)
                    subprocess.Popen([file_path], start_new_session=True)
                except Exception:
                    subprocess.Popen(["xdg-open", os.path.dirname(file_path)])

            # Schedule application termination in 1.5 seconds so installer can replace binary without lock
            def _delayed_exit():
                time.sleep(1.5)
                logger.info("Auto Update: terminating application process for update...")
                os._exit(0)

            threading.Thread(target=_delayed_exit, daemon=True).start()
            return {"success": True, "message": "Memulai installer pembaruan dan menutup aplikasi..."}

        except Exception as e:
            logger.exception(f"Failed to launch update installer: {e}")
            return {"success": False, "message": f"Gagal menjalankan installer: {e}"}


update_service = UpdateService()
