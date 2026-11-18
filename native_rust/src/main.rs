#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod app;
pub mod events;
pub mod models;
pub mod services;
pub mod ui;
pub mod worker;

use eframe::egui;
use tokio::sync::mpsc;

use crate::app::{load_app_icon_data, RadioCasterApp};
use crate::events::{AppCommand, AppEvent};
use crate::services::audio_player::AudioPlayerService;
use crate::services::cache_service::CacheService;
use crate::services::db_service::DatabaseService;
use crate::services::radioboss_service::RadioBossService;
use crate::services::settings_service::SettingsService;
use crate::services::stream_server::{spawn_stream_server, StreamServerState};
use crate::services::telemetry_service::TelemetryService;
use crate::services::update_service::UpdateService;
use crate::services::ytdlp_service::YtDlpService;
use crate::services::ytmusic_service::YtMusicService;
use crate::worker::{spawn_backend_workers, BackendContext};

fn main() -> eframe::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to create Tokio runtime");

    let _guard = rt.enter();

    let db = DatabaseService::new().expect("Failed to initialize SQLite database");
    let settings = SettingsService::new(db.clone());
    let radioboss = RadioBossService::new();
    let ytmusic = YtMusicService::new();
    let ytdlp = YtDlpService::new();
    let cache = CacheService::new(db.clone(), ytdlp.clone());
    let telemetry = TelemetryService::new(db.clone(), settings.clone());
    let update = UpdateService::new();
    let audio = AudioPlayerService::new();

    // Start local/LAN Axum MP3 stream relay server (:8000)
    spawn_stream_server(StreamServerState {
        settings: settings.clone(),
        cache: cache.clone(),
        ytdlp: ytdlp.clone(),
    });

    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel::<AppCommand>();
    let (evt_tx, evt_rx) = mpsc::unbounded_channel::<AppEvent>();

    let backend_ctx = BackendContext {
        db,
        settings,
        radioboss,
        ytmusic,
        ytdlp,
        cache,
        telemetry,
        update,
        audio: audio.clone(),
    };

    let mut viewport = egui::ViewportBuilder::default()
        .with_title("Radio Caster Bridge | YouTube Music Studio Streamer & RadioBOSS Controller")
        .with_inner_size([1360.0, 860.0])
        .with_min_inner_size([1024.0, 680.0]);

    if let Some(icon) = load_app_icon_data() {
        viewport = viewport.with_icon(icon);
    }

    let native_options = eframe::NativeOptions {
        viewport,
        ..Default::default()
    };

    eframe::run_native(
        "Radio Caster Bridge",
        native_options,
        Box::new(move |cc| {
            let _enter = rt.enter();
            spawn_backend_workers(backend_ctx, cmd_rx, evt_tx, cc.egui_ctx.clone());
            Ok(Box::new(RadioCasterApp::new(cc, cmd_tx, evt_rx, audio)))
        }),
    )
}
