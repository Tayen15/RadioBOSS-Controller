@echo off
title Radio Caster Bridge - Pure Native Rust
echo Memulai Radio Caster Bridge Native Engine (Rust)...
cd /d "%~dp0native_rust"
cargo run --release
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Gagal menjalankan aplikasi Native Rust. Pastikan Rust toolchain terpasang.
    pause
)
