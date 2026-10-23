"""PyInstaller Build Script: Packages Radio Caster Request Bridge into a single standalone Windows .exe."""
import os
import sys
import shutil
import subprocess

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_OUT = os.path.join(ROOT_DIR, "frontend", "out")
DESKTOP_APP = os.path.join(ROOT_DIR, "desktop", "app.py")
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
DIST_DIR = os.path.join(ROOT_DIR, "dist")
BUILD_DIR = os.path.join(ROOT_DIR, "build")


def main():
    print("=" * 60)
    print(" Radio Caster Request Bridge - Standalone .exe Builder")
    print("=" * 60)

    # 1. Verify frontend static export
    index_html = os.path.join(FRONTEND_OUT, "index.html")
    if not os.path.isfile(index_html):
        print("[*] Frontend static build not found. Running 'bun run build'...")
        frontend_dir = os.path.join(ROOT_DIR, "frontend")
        result = subprocess.run(["bun", "run", "build"], cwd=frontend_dir)
        if result.returncode != 0:
            print("[!] Bun build failed. Aborting packaging.")
            sys.exit(1)
    else:
        print(f"[+] Static frontend assets verified at: {FRONTEND_OUT}")

    # 2. PyInstaller command
    pyinstaller_exe = os.path.join(BACKEND_DIR, ".venv", "Scripts", "pyinstaller.exe")
    if not os.path.isfile(pyinstaller_exe):
        pyinstaller_exe = "pyinstaller"

    pyinstaller_cmd = [
        pyinstaller_exe,
        "--noconfirm",
        "--clean",
        "--onefile",
        "--console",
        "--name=RadioBOSSCaster",
        f"--paths={BACKEND_DIR}",
        f"--add-data={FRONTEND_OUT};frontend/out",
        f"--add-data={os.path.join(BACKEND_DIR, 'app')};app",
        "--collect-all=app",
        "--collect-all=fastapi",
        "--collect-all=starlette",
        "--collect-all=pydantic",
        "--collect-all=pydantic_settings",
        "--collect-all=uvicorn",
        "--collect-all=ytmusicapi",
        "--collect-all=yt_dlp",
        "--collect-all=webview",
        "--collect-all=pythonnet",
        "--collect-all=clr_loader",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.lifespans",
        "--hidden-import=uvicorn.lifespans.on",
        "--hidden-import=uvicorn.lifespans.off",
        "--hidden-import=defusedxml",
        "--hidden-import=defusedxml.ElementTree",
        "--hidden-import=sqlite3",
        "--hidden-import=webview.platforms.winforms",
        "--hidden-import=webview.platforms.edgechromium",
        DESKTOP_APP,
    ]

    print(f"[*] Executing PyInstaller command...")
    result = subprocess.run(pyinstaller_cmd, cwd=ROOT_DIR)

    if result.returncode != 0:
        print("[!] PyInstaller build failed!")
        sys.exit(result.returncode)

    exe_path = os.path.join(DIST_DIR, "RadioBOSSCaster.exe")
    if os.path.isfile(exe_path):
        size_mb = os.path.getsize(exe_path) / (1024 * 1024)
        print("\n" + "=" * 60)
        print(" BUILD SUCCESSFUL!")
        print(f" Standalone Executable: {exe_path}")
        print(f" File Size: {size_mb:.2f} MB")
        print("=" * 60)
    else:
        print("[!] Expected executable was not found at:", exe_path)


if __name__ == "__main__":
    main()
