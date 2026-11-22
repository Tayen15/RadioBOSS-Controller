@echo off
title Radio Caster Bridge Studio (RCB Studio)
echo Memulai Radio Caster Bridge Studio...
cd /d "%~dp0native_rust"
if exist "target\release\RCBStudio.exe" (
    start "" "target\release\RCBStudio.exe"
) else (
    cargo run --release --bin RCBStudio
)
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Gagal menjalankan RCB Studio.
    pause
)
