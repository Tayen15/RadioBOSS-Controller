# Technical Specification: Radio Caster Request Bridge

## Environment & Configuration
Configuration is stored in `%APPDATA%/RadioBOSSCaster/config.json` with dynamic runtime updating (no file restarts needed):
- `radioboss_host`: default `http://127.0.0.1`
- `radioboss_port`: default `9000`
- `radioboss_password`: RadioBOSS remote control password
- `title_format_mode`: `'radioboss_native'` (default), `'artist_title'`, `'title_artist'`, `'title_only'`, or `'custom'`
- `custom_title_format`: default `"{artist} - {title}"`
- `server_port`: `8000`

## Backend API Specification
- `GET /api/health` -> `{ "status": "online", "service": "...", "version": "0.7.0" }`
- `GET /api/settings` -> Returns current active configuration
- `POST /api/settings` -> Updates configuration in `%APPDATA%` and validates RadioBOSS connection
- `POST /api/search` -> `{ "query": string, "limit": int }` -> Returns array of official songs: `{ video_id, title, artists, album, duration, thumbnail_url }`
- `POST /api/resolve` -> `{ "url": string }` -> Returns resolved metadata & direct stream URL
- `POST /api/queue` -> `{ "video_id": string, "title": string, "pos": int, "stream_url"?: string }` -> Injects stream into RadioBOSS via `inserttrack`
- `GET /api/stream/{video_id}.mp3` -> Real-time transcode to 320k CBR MP3 with embedded ID3v2 metadata
- `GET /api/radioboss/status` -> Queries RadioBOSS `playbackinfo` and returns connectivity + currently playing track

## Packaging & Build
- Frontend static export: `bun run build` -> `frontend/out/`
- Executable bundler: PyInstaller single file executable -> `dist/RadioBOSSCaster.exe` (30.46 MB)
- Desktop webview: Microsoft Edge WebView2 via `pywebview`

## Data Types & Schemas
- Strict Pydantic v2 schemas in backend (`app/schemas/track.py`, `app/services/settings_service.py`)
- Strict TypeScript interfaces in frontend
