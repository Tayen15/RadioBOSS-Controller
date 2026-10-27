"""Folder Picker & Explorer helper."""
import logging
import os
import subprocess
import sys
from typing import Optional

logger = logging.getLogger(__name__)


def pick_folder(initial_dir: Optional[str] = None, title: str = "Pilih Folder Penyimpanan") -> Optional[str]:
    """Open native OS folder selection dialog."""
    # 1. Try tkinter (built-in, clean, standard)
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        norm_dir = os.path.abspath(initial_dir) if initial_dir and os.path.isdir(initial_dir) else None
        folder = filedialog.askdirectory(initialdir=norm_dir, title=title, parent=root)
        root.destroy()
        if folder:
            return os.path.normpath(folder)
    except Exception as e:
        logger.warning(f"Tkinter folder dialog failed: {e}")

    # 2. Fallback for Windows using PowerShell STA FolderBrowserDialog
    if sys.platform == "win32":
        try:
            import base64
            norm_dir = (
                os.path.abspath(initial_dir).replace("'", "''")
                if initial_dir and os.path.isdir(initial_dir)
                else ""
            )
            ps_script = f"""
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '{title}'
$f.ShowNewFolderButton = $true
if ('{norm_dir}') {{ $f.SelectedPath = '{norm_dir}' }}
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($f.SelectedPath)
}}
"""
            encoded = base64.b64encode(ps_script.encode("utf-16le")).decode("ascii")
            res = subprocess.run(
                ["powershell", "-NoProfile", "-Sta", "-EncodedCommand", encoded],
                capture_output=True,
                text=True,
                timeout=120,
            )
            out = res.stdout.strip()
            if out and os.path.isdir(out):
                return os.path.normpath(out)
        except Exception as e:
            logger.warning(f"PowerShell folder dialog failed: {e}")

    return None


def open_directory_in_explorer(target_path: str) -> bool:
    """Open a folder in system file manager (Windows File Explorer, xdg-open on Linux, Finder on macOS)."""
    try:
        path = os.path.abspath(target_path)
        os.makedirs(path, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(path)
            return True
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
            return True
        else:
            subprocess.Popen(["xdg-open", path])
            return True
    except Exception as e:
        logger.error(f"Failed to open directory {target_path}: {e}")
        return False
