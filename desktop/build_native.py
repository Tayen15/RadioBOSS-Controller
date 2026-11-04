"""Native Desktop PyInstaller Build Script: Packages Radio Caster Bridge (PySide6 / Qt6 Native)."""
import os
import shutil
import subprocess
import sys
import zipfile

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NATIVE_ENTRY = os.path.join(ROOT_DIR, "native_gui", "main.py")
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
DIST_DIR = os.path.join(ROOT_DIR, "dist")
BUILD_DIR = os.path.join(ROOT_DIR, "build")


def ensure_ffmpeg_in_dist() -> str | None:
    """Ensure ffmpeg.exe is present in dist/ for standalone portable distribution."""
    if sys.platform != "win32":
        return None
    os.makedirs(DIST_DIR, exist_ok=True)
    target_ffmpeg = os.path.join(DIST_DIR, "ffmpeg.exe")
    if os.path.isfile(target_ffmpeg) and os.path.getsize(target_ffmpeg) > 100000:
        return target_ffmpeg

    candidates = [
        shutil.which("ffmpeg"),
        r"D:\Apps\ffmpeg\bin\ffmpeg.exe",
        os.path.join(ROOT_DIR, "ffmpeg.exe"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            try:
                shutil.copy2(c, target_ffmpeg)
                print(f"[+] Bundled ffmpeg.exe into dist: {target_ffmpeg}")
                return target_ffmpeg
            except Exception as e:
                print(f"[!] Could not copy ffmpeg.exe from {c}: {e}")
    return None


def create_native_portable_zip(zip_path: str, exe_path: str):
    """Create a self-contained Portable ZIP package for Windows."""
    print(f"[*] Packaging Native Portable ZIP: {zip_path}")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(exe_path, "RadioCasterNative.exe")
        ffmpeg_dist = os.path.join(DIST_DIR, "ffmpeg.exe")
        if os.path.isfile(ffmpeg_dist):
            zf.write(ffmpeg_dist, "ffmpeg.exe")
        zf.writestr(
            "portable.txt",
            "Radio Caster Bridge Pure Native Edition (PySide6 / Qt6)\r\n"
            "All SQLite database, settings, logs, and audio cache are kept in ./data/\r\n",
        )
        run_bat_content = (
            "@echo off\r\n"
            "cd /d \"%~dp0\"\r\n"
            "start \"\" \"RadioCasterNative.exe\" %*\r\n"
        )
        zf.writestr("run.bat", run_bat_content)
        readme_content = (
            "==========================================================\r\n"
            " Radio Caster Request Bridge - Pure Native Studio Edition\r\n"
            "==========================================================\r\n\r\n"
            "1. Pure native desktop application running on PySide6 / Qt6.\r\n"
            "2. Ultra-lightweight memory footprint (~50-130 MB RAM).\r\n"
            "3. No Edge WebView2 or browser runtimes required.\r\n"
            "4. Double-click RadioCasterNative.exe or run.bat to start.\r\n"
        )
        zf.writestr("README.txt", readme_content)
    print(f"[+] Portable ZIP ready: {zip_path}")


def build_native_exe():
    """Build single-file native executable with PyInstaller."""
    print("=" * 60)
    print("  BUILDING RADIO CASTER BRIDGE (PURE NATIVE PYSIDE6 / QT6)")
    print("=" * 60)

    # 1. Clean previous build artifacts
    for d in [BUILD_DIR]:
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)

    # 2. Collect stylesheet and assets
    qss_file = os.path.join(ROOT_DIR, "native_gui", "styles", "theme.qss")
    styles_data = f"{qss_file};native_gui/styles" if sys.platform == "win32" else f"{qss_file}:native_gui/styles"

    # 3. Assemble PyInstaller command
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",  # onedir is faster to launch and verify than onedir/onefile
        "--windowed",
        "--name=RadioCasterNative",
        f"--add-data={styles_data}",
        f"--paths={BACKEND_DIR}",
        f"--paths={ROOT_DIR}",
        "--hidden-import=app",
        "--hidden-import=app.services.radioboss_service",
        "--hidden-import=app.services.ytmusic_service",
        "--hidden-import=app.services.ytdlp_service",
        "--hidden-import=app.services.cache_service",
        "--hidden-import=app.services.settings_service",
        "--hidden-import=app.services.system_service",
        "--hidden-import=app.services.db_service",
        "--hidden-import=app.services.history_service",
        "--hidden-import=ytmusicapi",
        "--hidden-import=yt_dlp",
        "--hidden-import=mutagen",
        "--hidden-import=mutagen.id3",
        "--hidden-import=mutagen.mp3",
        "--hidden-import=PySide6.QtMultimedia",
        "--collect-all=ytmusicapi",
        "--collect-all=PySide6",
        NATIVE_ENTRY,
    ]

    print("[*] Running PyInstaller command:")
    print(" ".join(cmd))
    subprocess.check_call(cmd)

    exe_path = os.path.join(DIST_DIR, "RadioCasterNative", "RadioCasterNative.exe")
    if os.path.isfile(exe_path):
        print(f"[+] Native executable created: {exe_path}")
        ensure_ffmpeg_in_dist()
        zip_out = os.path.join(DIST_DIR, "RadioCasterNative-Windows-v1.0.0-Portable.zip")
        create_native_portable_zip(zip_out, exe_path)
    else:
        print("[!] Executable build check failed.")


if __name__ == "__main__":
    build_native_exe()
