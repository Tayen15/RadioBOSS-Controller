"""PyInstaller Build Script: Packages Radio Caster Request Bridge for Windows (x64/x86) and Linux."""
import io
import os
import shutil
import subprocess
import sys
import tarfile
import zipfile

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_OUT = os.path.join(ROOT_DIR, "frontend", "out")
DESKTOP_APP = os.path.join(ROOT_DIR, "desktop", "app.py")
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
DIST_DIR = os.path.join(ROOT_DIR, "dist")
BUILD_DIR = os.path.join(ROOT_DIR, "build")


def create_windows_portable_zip(zip_path: str, exe_path: str):
    """Create a self-contained Portable ZIP package for Windows."""
    print(f"[*] Packaging Portable ZIP: {zip_path}")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(exe_path, "RadioBOSSCaster.exe")
        zf.writestr(
            "portable.txt",
            "Radio Caster Bridge Portable Mode Active\r\n"
            "All SQLite database, settings, logs, and audio cache are kept in ./data/\r\n",
        )
        run_bat_content = (
            "@echo off\r\n"
            "cd /d \"%~dp0\"\r\n"
            "start \"\" \"RadioBOSSCaster.exe\" %*\r\n"
        )
        zf.writestr("run.bat", run_bat_content)
        readme_content = (
            "==========================================================\r\n"
            " Radio Caster Request Bridge - Portable Edition\r\n"
            "==========================================================\r\n\r\n"
            "1. This application runs in 100% self-contained portable mode.\r\n"
            "2. All settings, database, and audio cache are stored inside ./data/\r\n"
            "3. Double-click RadioBOSSCaster.exe or run.bat to start.\r\n"
            "4. To move to a USB flash drive or another PC, simply copy this entire folder.\r\n"
        )
        zf.writestr("README.txt", readme_content)


def create_linux_portable_tar(tar_path: str, bin_path: str, bin_name: str):
    """Create a self-contained Portable TAR.GZ package for Linux."""
    print(f"[*] Packaging Portable TAR.GZ: {tar_path}")
    with tarfile.open(tar_path, "w:gz") as tf:
        tf.add(bin_path, arcname=bin_name)

        p_info = tarfile.TarInfo(name="portable.txt")
        p_bytes = (
            b"Radio Caster Bridge Portable Mode Active\n"
            b"All SQLite database, settings, logs, and audio cache are kept in ./data/\n"
        )
        p_info.size = len(p_bytes)
        tf.addfile(p_info, io.BytesIO(p_bytes))

        sh_info = tarfile.TarInfo(name="run.sh")
        sh_bytes = (
            f"#!/usr/bin/env bash\n"
            f'DIR="$(cd "$(dirname "${{BASH_SOURCE[0]}}")" >/dev/null 2>&1 && pwd)"\n'
            f'cd "$DIR"\n'
            f"chmod +x ./{bin_name}\n"
            f'./{bin_name} "$@"\n'
        ).encode("utf-8")
        sh_info.size = len(sh_bytes)
        sh_info.mode = 0o755
        tf.addfile(sh_info, io.BytesIO(sh_bytes))


def main():
    is_windows = sys.platform == "win32"
    arch = "x86" if sys.maxsize <= 2**32 else "x64"
    platform_name = "Windows" if is_windows else "Linux"
    data_sep = ";" if is_windows else ":"

    base_name = f"RadioBOSSCaster-{platform_name}-{arch}"
    output_exe = f"{base_name}.exe" if is_windows else base_name

    print("=" * 60)
    print(f" Radio Caster Bridge - Standalone Builder [{platform_name} {arch}]")
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
    if is_windows:
        pyinstaller_exe = os.path.join(BACKEND_DIR, ".venv", "Scripts", "pyinstaller.exe")
    else:
        pyinstaller_exe = os.path.join(BACKEND_DIR, ".venv", "bin", "pyinstaller")

    if not os.path.isfile(pyinstaller_exe):
        pyinstaller_exe = "pyinstaller"

    pyinstaller_cmd = [
        pyinstaller_exe,
        "--noconfirm",
        "--clean",
        "--onefile",
        "--console",
        f"--name={base_name}",
        f"--paths={BACKEND_DIR}",
        f"--add-data={FRONTEND_OUT}{data_sep}frontend/out",
        f"--add-data={os.path.join(BACKEND_DIR, 'app')}{data_sep}app",
        "--collect-all=app",
        "--collect-all=fastapi",
        "--collect-all=starlette",
        "--collect-all=pydantic",
        "--collect-all=pydantic_settings",
        "--collect-all=uvicorn",
        "--collect-all=ytmusicapi",
        "--collect-all=yt_dlp",
        "--collect-all=webview",
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
    ]

    if is_windows:
        pyinstaller_cmd.extend([
            "--collect-all=pythonnet",
            "--collect-all=clr_loader",
            "--hidden-import=webview.platforms.winforms",
            "--hidden-import=webview.platforms.edgechromium",
        ])
    else:
        pyinstaller_cmd.extend([
            "--hidden-import=webview.platforms.gtk",
            "--hidden-import=webview.platforms.qt",
        ])

    pyinstaller_cmd.append(DESKTOP_APP)

    print(f"[*] Executing PyInstaller command for {base_name}...")
    result = subprocess.run(pyinstaller_cmd, cwd=ROOT_DIR)

    if result.returncode != 0:
        print("[!] PyInstaller build failed!")
        sys.exit(result.returncode)

    built_bin_path = os.path.join(DIST_DIR, output_exe)
    if os.path.isfile(built_bin_path):
        size_mb = os.path.getsize(built_bin_path) / (1024 * 1024)
        print("\n" + "=" * 60)
        print(" BUILD SUCCESSFUL!")
        print(f" Standalone Binary: {built_bin_path}")
        print(f" File Size: {size_mb:.2f} MB")

        # Windows: Keep standard RadioBOSSCaster.exe copy for local run.bat
        if is_windows:
            std_exe = os.path.join(DIST_DIR, "RadioBOSSCaster.exe")
            try:
                shutil.copy2(built_bin_path, std_exe)
                print(f" [+] Standard Executable updated: {std_exe}")
            except Exception as e:
                print(f" [!] Could not copy to standard RadioBOSSCaster.exe: {e}")

            # Generate Portable ZIP package
            zip_out = os.path.join(DIST_DIR, f"RadioBOSSCaster-Portable-Windows-{arch}.zip")
            create_windows_portable_zip(zip_out, built_bin_path)
            print(f" [+] Portable ZIP package created: {zip_out}")
        else:
            # Linux: Generate Portable TAR.GZ package
            tar_out = os.path.join(DIST_DIR, f"RadioBOSSCaster-Portable-Linux-{arch}.tar.gz")
            create_linux_portable_tar(tar_out, built_bin_path, base_name)
            print(f" [+] Portable TAR.GZ package created: {tar_out}")

        print("=" * 60)
    else:
        print("[!] Expected binary was not found at:", built_bin_path)


if __name__ == "__main__":
    main()

