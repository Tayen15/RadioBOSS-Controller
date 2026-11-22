use std::net::SocketAddr;
use std::process::Stdio;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use tokio::fs::File;
use tokio::process::Command;
use tokio_util::io::ReaderStream;

use crate::services::cache_service::CacheService;
use crate::services::settings_service::SettingsService;
use crate::services::ytdlp_service::YtDlpService;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone)]
pub struct StreamServerState {
    pub settings: SettingsService,
    pub cache: CacheService,
    pub ytdlp: YtDlpService,
}

/// Spawns lightweight Axum micro HTTP server (`0.0.0.0:{port}`) to serve `/api/stream/{video_id}.mp3`
/// to local or LAN RadioBOSS instances.
pub fn spawn_stream_server(state: StreamServerState) {
    let port = state.settings.get_config().server_port;
    let bind_port = if port == 0 { 8000 } else { port };
    let shared = Arc::new(state);

    tokio::spawn(async move {
        let app = Router::new()
            .route("/api/health", get(|| async { "OK" }))
            .route("/api/stream/{video_id}", get(stream_mp3_handler))
            .with_state(shared);

        let addr = SocketAddr::from(([0, 0, 0, 0], bind_port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                let _ = axum::serve(listener, app).await;
            }
            Err(_) => {
                // Fallback if port 8000 is already occupied
                if let Ok(listener) = tokio::net::TcpListener::bind("0.0.0.0:0").await {
                    let _ = axum::serve(listener, app).await;
                }
            }
        }
    });
}

async fn stream_mp3_handler(
    State(state): State<Arc<StreamServerState>>,
    AxumPath(video_id_param): AxumPath<String>,
) -> impl IntoResponse {
    let clean_id = video_id_param.trim_end_matches(".mp3").trim().to_string();
    let cfg = state.settings.get_config();

    // 1. Serve directly from disk cache if already transcoded
    if let Some(cached_path) = state.cache.get_cached_file_by_id(&cfg, &clean_id) {
        if let Ok(file) = File::open(&cached_path).await {
            let file_len = file.metadata().await.map(|m| m.len()).ok();
            let stream = ReaderStream::new(file);
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, "audio/mpeg".parse().unwrap());
            if let Some(len) = file_len {
                if let Ok(val) = len.to_string().parse() {
                    headers.insert(header::CONTENT_LENGTH, val);
                }
            }
            return (StatusCode::OK, headers, Body::from_stream(stream)).into_response();
        }
    }

    // 2. Real-time FFmpeg pipe transcode from resolved YouTube stream URL
    let Some(stream_url) = state.ytdlp.get_live_stream_url(&clean_id).await else {
        return (StatusCode::NOT_FOUND, "Stream audio tidak ditemukan").into_response();
    };

    let ffmpeg_bin = CacheService::find_ffmpeg_binary();
    let bitrate = if cfg.audio_quality.ends_with('k') {
        cfg.audio_quality.clone()
    } else if cfg.audio_quality.is_empty() {
        "320k".to_string()
    } else {
        format!("{}k", cfg.audio_quality)
    };

    let mut cmd = Command::new(&ffmpeg_bin);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.args([
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-i",
        &stream_url,
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        &bitrate,
        "-f",
        "mp3",
        "pipe:1",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .kill_on_drop(true);

    match cmd.spawn() {
        Ok(mut child) => {
            if let Some(stdout) = child.stdout.take() {
                // Keep child alive until stream finishes by spawning waiter
                tokio::spawn(async move {
                    let _ = child.wait().await;
                });
                let stream = ReaderStream::new(stdout);
                let mut headers = HeaderMap::new();
                headers.insert(header::CONTENT_TYPE, "audio/mpeg".parse().unwrap());
                return (StatusCode::OK, headers, Body::from_stream(stream)).into_response();
            }
            (StatusCode::INTERNAL_SERVER_ERROR, "FFmpeg pipe error").into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("FFmpeg error: {e}"),
        )
            .into_response(),
    }
}
