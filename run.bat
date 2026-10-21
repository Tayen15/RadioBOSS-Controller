@echo off
title Radio Caster Request Bridge Launcher
cd /d "%~dp0"

if exist "dist\RadioBOSSCaster.exe" (
    echo [✓] Menjalankan Radio Caster Request Bridge...
    start "" "dist\RadioBOSSCaster.exe"
    exit /b 0
)

echo [!] Executable belum ditemukan. Membangun aplikasi desktop...
call backend\.venv\Scripts\python.exe desktop\build_exe.py
if exist "dist\RadioBOSSCaster.exe" (
    start "" "dist\RadioBOSSCaster.exe"
)
exit /b 0
