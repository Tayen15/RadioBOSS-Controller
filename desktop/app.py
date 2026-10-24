"""Desktop Launcher: Runs FastAPI in background and opens native Edge WebView2 window."""
import os
import sys
import threading
import time
import urllib.request
import logging
import multiprocessing

class DummyStream:
    encoding = "utf-8"
    def write(self, *args, **kwargs): pass
    def writelines(self, *args, **kwargs): pass
    def flush(self): pass
    def isatty(self): return False
    @property
    def buffer(self): return self

if sys.stdout is None or not hasattr(sys.stdout, "buffer"):
    sys.stdout = DummyStream()
if sys.stderr is None or not hasattr(sys.stderr, "buffer"):
    sys.stderr = DummyStream()
if sys.stdin is None:
    sys.stdin = DummyStream()

def _get_desktop_storage_dir() -> str:
    """Resolve storage directory supporting Portable Mode and cross-platform (Windows & Linux)."""
    try:
        if getattr(sys, "frozen", False):
            app_root = os.path.dirname(os.path.abspath(sys.executable))
        else:
            app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        if (
            "--portable" in sys.argv
            or os.path.isfile(os.path.join(app_root, "portable.txt"))
            or os.path.isdir(os.path.join(app_root, "portable"))
            or os.path.isdir(os.path.join(app_root, "data"))
        ):
            p_dir = os.path.join(app_root, "data")
            os.makedirs(p_dir, exist_ok=True)
            return p_dir
    except Exception:
        pass

    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
        log_dir = os.path.join(appdata, "RadioBOSSCaster")
    else:
        home = os.path.expanduser("~")
        log_dir = os.path.join(home, ".config", "RadioBOSSCaster")
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


def global_excepthook(exc_type, exc_val, tb):
    try:
        import traceback
        log_dir = _get_desktop_storage_dir()
        with open(os.path.join(log_dir, "fatal.log"), "a", encoding="utf-8") as f:
            f.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] === FATAL EXCEPTION ===\n")
            traceback.print_exception(exc_type, exc_val, tb, file=f)
    except Exception:
        pass
    sys.__excepthook__(exc_type, exc_val, tb)


sys.excepthook = global_excepthook

# Configure early logging
try:
    log_dir = _get_desktop_storage_dir()
    log_file = os.path.join(log_dir, "app.log")
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
except Exception:
    pass

logger = logging.getLogger("desktop_app")

# Ensure backend root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
BACKEND_DIR = os.path.join(PROJECT_DIR, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# PyInstaller frozen bundle support
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    bundle_dir = sys._MEIPASS
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)
    backend_bundle = os.path.join(bundle_dir, "backend")
    if os.path.isdir(backend_bundle) and backend_bundle not in sys.path:
        sys.path.insert(0, backend_bundle)

try:
    import fastapi
    import starlette
    import pydantic
    import pydantic_settings
    import uvicorn
    import webview
    import yt_dlp
    import ytmusicapi
    import defusedxml
    import defusedxml.ElementTree
    from app.main import app
    from app.services.settings_service import settings_service
    logger.info("Core modules imported successfully.")
except Exception as e:
    logger.exception(f"Fatal error importing core modules: {e}")
    raise


def run_fastapi():
    """Run uvicorn server in background thread with its own asyncio event loop."""
    try:
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        cfg = settings_service.get_config()
        port = cfg.server_port or 8000
        config = uvicorn.Config(
            app=app,
            host="127.0.0.1",
            port=port,
            loop="asyncio",
            log_level="info",
            access_log=False,
        )
        server = uvicorn.Server(config)
        logger.info(f"Uvicorn serving on 127.0.0.1:{port}")
        loop.run_until_complete(server.serve())
    except Exception as e:
        logger.exception(f"FastAPI server crashed: {e}")


def wait_for_server(port: int, max_wait: float = 12.0) -> bool:
    """Wait until local FastAPI server responds."""
    start_time = time.time()
    url = f"http://127.0.0.1:{port}/api/health"
    while time.time() - start_time < max_wait:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)
    return False


def hide_console():
    """Hide console window on Windows if running in desktop mode."""
    if sys.platform == "win32":
        try:
            import ctypes
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE
        except Exception:
            pass


def main():
    """Application entry point."""
    hide_console()
    logger.info("Initializing Radio Caster Request Bridge Desktop...")
    try:
        cfg = settings_service.get_config()
        port = cfg.server_port or 8000

        # Start FastAPI daemon thread
        server_thread = threading.Thread(target=run_fastapi, daemon=True)
        server_thread.start()
        logger.info(f"FastAPI daemon thread started on port {port}")

        # Wait for server readiness
        ready = wait_for_server(port)
        if not ready:
            logger.warning(f"Server at port {port} did not respond within timeout, opening WebView anyway.")
        else:
            logger.info("FastAPI health check passed.")

        # Launch native WebView window (Edge WebView2 on Windows, WebKit2GTK on Linux) or browser
        window_url = f"http://127.0.0.1:{port}"
        logger.info(f"Creating window for {window_url}")

        storage_dir = _get_desktop_storage_dir()
        webview_storage = os.path.join(storage_dir, "webview")
        os.makedirs(webview_storage, exist_ok=True)

        window = webview.create_window(
            title="Radio Caster Bridge | YouTube Music Studio Streamer & RadioBOSS Controller",
            url=window_url,
            width=1240,
            height=840,
            min_size=(960, 620),
            background_color="#000000",
            text_select=True,
        )

        if sys.platform == "win32":
            webview.start(gui="edgechromium", debug=False, storage_path=webview_storage)
        else:
            try:
                webview.start(debug=False, storage_path=webview_storage)
            except Exception as e:
                logger.warning(f"Native GTK/Qt webview GUI failed on Linux: {e}. Opening system default browser...")
                import webbrowser
                webbrowser.open(window_url)
                print(f"[*] Radio Caster Bridge running at {window_url}")
                print("[*] Press Ctrl+C to stop.")
                try:
                    while server_thread.is_alive():
                        time.sleep(1)
                except KeyboardInterrupt:
                    pass

        logger.info("Application closed. Exiting.")
        sys.exit(0)
    except Exception as e:
        logger.exception(f"Unhandled exception during desktop execution: {e}")
        sys.exit(1)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
