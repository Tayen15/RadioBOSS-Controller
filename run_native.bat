@echo off
cd /d "%~dp0"
echo Menjalankan Radio Caster Bridge Native GUI...
backend\.venv\Scripts\python.exe native_gui\main.py
pause
