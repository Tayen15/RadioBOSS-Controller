#!/usr/bin/env bash
# ========================================================
# Radio Caster Request Bridge - Linux Single-Click Launcher
# ========================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================================="
echo " Radio Caster Bridge | Linux Studio Streamer & Controller"
echo "=========================================================="

# 1. Check if standalone compiled Linux binary exists in dist/ or root
if [ -f "./dist/RadioBOSSCaster-Linux-x64" ]; then
    echo "[+] Running standalone binary: ./dist/RadioBOSSCaster-Linux-x64"
    chmod +x "./dist/RadioBOSSCaster-Linux-x64"
    exec "./dist/RadioBOSSCaster-Linux-x64" "$@"
elif [ -f "./RadioBOSSCaster-Linux-x64" ]; then
    echo "[+] Running standalone binary: ./RadioBOSSCaster-Linux-x64"
    chmod +x "./RadioBOSSCaster-Linux-x64"
    exec "./RadioBOSSCaster-Linux-x64" "$@"
fi

# 2. Fallback to Python Virtual Environment
echo "[*] Launching via Python runtime..."
if [ -d "backend/.venv" ]; then
    source backend/.venv/bin/activate
fi

python3 desktop/app.py "$@"
