use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::Local;
use eframe::egui;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

use crate::events::{AppCommand, AppEvent};
use crate::models::config::AppConfig;
use crate::models::radioboss::PlaylistItem;
use crate::models::track::{HistoryItem, TrackItem};
use crate::services::audio_player::AudioPlayerService;
use crate::services::cache_service::CacheService;
use crate::services::db_service::DatabaseService;
use crate::services::radioboss_service::RadioBossService;
use crate::services::settings_service::SettingsService;
use crate::services::system_service;
use crate::services::telemetry_service::TelemetryService;
use crate::services::title_cleaner::clean_broadcast_title;
use crate::services::update_service::UpdateService;
use crate::services::ytdlp_service::YtDlpService;
use crate::services::ytmusic_service::YtMusicService;

#[derive(Clone)]
pub struct BackendContext {
    pub db: DatabaseService,
    pub settings: SettingsService,
    pub radioboss: RadioBossService,
    pub ytmusic: YtMusicService,
    pub ytdlp: YtDlpService,
    pub cache: CacheService,
    pub telemetry: TelemetryService,
    pub update: UpdateService,
    pub audio: AudioPlayerService,
}

pub fn spawn_backend_workers(
    ctx_services: BackendContext,
    mut cmd_rx: UnboundedReceiver<AppCommand>,
    evt_tx: UnboundedSender<AppEvent>,
    egui_ctx: egui::Context,
) {
    let auto_refresh = Arc::new(AtomicBool::new(true));
    let last_status_playing = Arc::new(AtomicBool::new(false));
    let cached_playlist: Arc<std::sync::Mutex<Vec<PlaylistItem>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));

    let emit = {
        let tx = evt_tx.clone();
        let ui_ctx = egui_ctx.clone();
        move |event: AppEvent| {
            let _ = tx.send(event);
            ui_ctx.request_repaint();
        }
    };

    // Initial bootstrap load
    {
        let services = ctx_services.clone();
        let emit_boot = emit.clone();
        tokio::spawn(async move {
            emit_boot(AppEvent::ConfigUpdated(services.settings.get_config()));
            emit_boot(AppEvent::HistoryLoaded(services.db.get_history(100)));
            emit_boot(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
            emit_boot(AppEvent::SystemSpecsLoaded(system_service::get_system_specs()));

            let cfg = services.settings.get_config();
            let stats = services.cache.get_cache_stats(&cfg);
            let cached_list = services.db.get_all_cached_tracks(200);
            let ids: HashSet<String> = cached_list
                .iter()
                .filter(|c| c.is_cached)
                .map(|c| c.video_id.clone())
                .collect();
            emit_boot(AppEvent::CachedIdsUpdated(ids));
            emit_boot(AppEvent::CacheStatsUpdated {
                stats,
                cached_tracks: cached_list,
            });
            emit_boot(AppEvent::SessionStatsUpdated {
                stats: services.telemetry.get_session_stats(),
                station_hash: services.telemetry.station_hash.clone(),
            });

            // Auto-discover RadioBOSS playlist tabs & silent update check
            let tabs = services.radioboss.get_tabs_info(&cfg).await;
            emit_boot(AppEvent::TabsUpdated {
                tabs,
                notify: false,
            });

            let upd = services.update.check_for_updates().await;
            emit_boot(AppEvent::UpdateChecked {
                result: upd,
                manual: false,
            });
        });
    }

    // 1-second realtime RadioBOSS polling loop (Status + Playlist)
    {
        let services = ctx_services.clone();
        let emit_poll = emit.clone();
        let auto_ref = auto_refresh.clone();
        let is_playing_flag = last_status_playing.clone();
        let playlist_cache = cached_playlist.clone();

        tokio::spawn(async move {
            let mut fail_streak: u8 = 0;
            loop {
                if auto_ref.load(Ordering::Relaxed) {
                    let cfg = services.settings.get_config();
                    let status = services.radioboss.check_status(&cfg).await;
                    if status.connected {
                        fail_streak = 0;
                        let playing = status
                            .now_playing
                            .as_ref()
                            .map(|np| np.status == "playing")
                            .unwrap_or(false);
                        is_playing_flag.store(playing, Ordering::Relaxed);

                        // 3-tier CasterHub sync: only report on-air track when RadioBOSS is actually playing
                        if playing {
                            if let Some(ref np) = status.now_playing {
                                let parts: Vec<&str> = np.title.splitn(2, " - ").collect();
                                if parts.len() == 2 {
                                    services.telemetry.set_onair_track(parts[1], parts[0], "");
                                } else {
                                    services.telemetry.set_onair_track(&np.title, "", "");
                                }
                            }
                        } else {
                            services.telemetry.clear_onair_track();
                        }

                        emit_poll(AppEvent::StatusUpdated { status });

                        if let Ok(pl) = services.radioboss.get_playlist(&cfg, 50).await {
                            *playlist_cache.lock().unwrap() = pl.clone();
                            emit_poll(AppEvent::PlaylistUpdated { tracks: pl });
                        }
                    } else {
                        fail_streak = fail_streak.saturating_add(1);
                        if fail_streak >= 2 {
                            is_playing_flag.store(false, Ordering::Relaxed);
                            services.telemetry.clear_onair_track();
                            emit_poll(AppEvent::StatusUpdated { status });
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
    }

    // Initial + 60-second Telemetry & Airtime heartbeat loop
    {
        let services = ctx_services.clone();
        let emit_tel = emit.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3)).await;
            let _ = services.telemetry.sync_outbox_to_casterhub().await;
            emit_tel(AppEvent::SessionStatsUpdated {
                stats: services.telemetry.get_session_stats(),
                station_hash: services.telemetry.station_hash.clone(),
            });
            loop {
                tokio::time::sleep(Duration::from_secs(60)).await;
                let _ = services.telemetry.sync_outbox_to_casterhub().await;
                emit_tel(AppEvent::SessionStatsUpdated {
                    stats: services.telemetry.get_session_stats(),
                    station_hash: services.telemetry.station_hash.clone(),
                });
            }
        });
    }

    // Main command dispatcher loop
    tokio::spawn(async move {
        while let Some(cmd) = cmd_rx.recv().await {
            let services = ctx_services.clone();
            let emit_cmd = emit.clone();
            let auto_ref = auto_refresh.clone();
            let is_playing_flag = last_status_playing.clone();
            let playlist_cache = cached_playlist.clone();

            tokio::spawn(async move {
                handle_command(
                    cmd,
                    services,
                    emit_cmd,
                    auto_ref,
                    is_playing_flag,
                    playlist_cache,
                )
                .await;
            });
        }
    });
}

async fn handle_command(
    cmd: AppCommand,
    services: BackendContext,
    emit: impl Fn(AppEvent) + Send + Sync + Clone + 'static,
    auto_refresh: Arc<AtomicBool>,
    is_playing_flag: Arc<AtomicBool>,
    playlist_cache: Arc<std::sync::Mutex<Vec<PlaylistItem>>>,
) {
    match cmd {
        AppCommand::SetAutoRefresh(enabled) => {
            auto_refresh.store(enabled, Ordering::Relaxed);
        }

        AppCommand::SyncStatus { silent } => {
            if !silent {
                emit(AppEvent::LoadingState {
                    key: "status",
                    active: true,
                });
            }
            let cfg = services.settings.get_config();
            let status = services.radioboss.check_status(&cfg).await;
            emit(AppEvent::StatusUpdated { status });
            if !silent {
                emit(AppEvent::LoadingState {
                    key: "status",
                    active: false,
                });
            }
        }

        AppCommand::SyncPlaylist {
            manual,
            override_tab,
        } => {
            if manual {
                emit(AppEvent::LoadingState {
                    key: "playlist",
                    active: true,
                });
            }
            let cfg = services.settings.get_config();
            if let Some(ref tab) = override_tab {
                if !tab.is_empty() {
                    let _ = services.radioboss.switch_playlist_tab(&cfg, tab).await;
                }
            }
            match services.radioboss.get_playlist(&cfg, 50).await {
                Ok(pl) => {
                    *playlist_cache.lock().unwrap() = pl.clone();
                    emit(AppEvent::PlaylistUpdated { tracks: pl });
                }
                Err(e) => {
                    if manual {
                        emit(AppEvent::Toast {
                            is_error: true,
                            text: e,
                        });
                    }
                }
            }
            if manual {
                emit(AppEvent::LoadingState {
                    key: "playlist",
                    active: false,
                });
            }
        }

        AppCommand::SyncTabs { notify } => {
            let cfg = services.settings.get_config();
            let tabs = services.radioboss.get_tabs_info(&cfg).await;
            emit(AppEvent::TabsUpdated { tabs, notify });
        }

        AppCommand::SelectPlaylistTab(tab_name) => {
            let mut cfg = services.settings.get_config();
            match services.radioboss.switch_playlist_tab(&cfg, &tab_name).await {
                Ok(_) => {
                    cfg.target_playlist_tab = tab_name.clone();
                    let _ = services.settings.update_config(cfg.clone());
                    emit(AppEvent::ConfigUpdated(cfg.clone()));
                    if let Ok(pl) = services.radioboss.get_playlist(&cfg, 50).await {
                        emit(AppEvent::PlaylistUpdated { tracks: pl });
                    }
                }
                Err(e) => emit(AppEvent::Toast {
                    is_error: true,
                    text: e,
                }),
            }
        }

        AppCommand::PlaybackControl(action) => {
            let cfg = services.settings.get_config();
            match services
                .radioboss
                .send_playback_command(&cfg, action.as_cmd())
                .await
            {
                Ok(_) => {
                    let status = services.radioboss.check_status(&cfg).await;
                    emit(AppEvent::StatusUpdated { status });
                }
                Err(e) => emit(AppEvent::Toast {
                    is_error: true,
                    text: e,
                }),
            }
        }

        AppCommand::SetLiveCastTitle(title) => {
            let cfg = services.settings.get_config();
            match services.radioboss.set_cast_title(&cfg, &title).await {
                Ok(_) => {
                    let status = services.radioboss.check_status(&cfg).await;
                    emit(AppEvent::StatusUpdated { status });
                }
                Err(e) => emit(AppEvent::Toast {
                    is_error: true,
                    text: e,
                }),
            }
        }

        AppCommand::SearchSongs(query) => {
            emit(AppEvent::LoadingState {
                key: "search",
                active: true,
            });
            match services.ytmusic.search_songs(&query, 15).await {
                Ok(results) => {
                    for t in &results {
                        services.ytdlp.store_track_meta(t);
                    }
                    emit(AppEvent::SearchResults { results });
                }
                Err(e) => {
                    emit(AppEvent::Toast {
                        is_error: true,
                        text: e,
                    });
                }
            }
            emit(AppEvent::LoadingState {
                key: "search",
                active: false,
            });
        }

        AppCommand::ResolveUrl(url) => {
            emit(AppEvent::LoadingState {
                key: "resolve",
                active: true,
            });
            if url.contains("list=") && !url.contains("watch?v=") {
                match services.ytdlp.extract_playlist(&url).await {
                    Ok((_, tracks)) => {
                        if let Some(first) = tracks.first().cloned() {
                            emit(AppEvent::UrlResolved {
                                track: first,
                                queued_playlist_tracks: Some(tracks),
                            });
                        } else {
                            emit(AppEvent::Toast {
                                is_error: true,
                                text: "Playlist tidak memiliki lagu yang valid.".to_string(),
                            });
                        }
                    }
                    Err(e) => emit(AppEvent::Toast {
                        is_error: true,
                        text: e,
                    }),
                }
            } else {
                match services.ytdlp.extract_track_info(&url).await {
                    Some((track, _)) => {
                        emit(AppEvent::UrlResolved {
                            track,
                            queued_playlist_tracks: None,
                        });
                    }
                    None => emit(AppEvent::Toast {
                        is_error: true,
                        text: "Gagal mengekstrak metadata dari tautan YouTube.".to_string(),
                    }),
                }
            }
            emit(AppEvent::LoadingState {
                key: "resolve",
                active: false,
            });
        }

        AppCommand::LoadRecommendations(video_id) => {
            emit(AppEvent::LoadingState {
                key: "recs",
                active: true,
            });
            if let Ok(tracks) = services.ytmusic.get_recommendations(&video_id, 12).await {
                for t in &tracks {
                    services.ytdlp.store_track_meta(t);
                }
                emit(AppEvent::RecommendationsLoaded(tracks));
            }
            emit(AppEvent::LoadingState {
                key: "recs",
                active: false,
            });
        }

        AppCommand::LoadArtistTracks(artist) => {
            emit(AppEvent::LoadingState {
                key: "artist",
                active: true,
            });
            if let Ok(tracks) = services.ytmusic.get_artist_top_tracks(&artist, 10).await {
                for t in &tracks {
                    services.ytdlp.store_track_meta(t);
                }
                emit(AppEvent::ArtistTracksLoaded(tracks));
            }
            emit(AppEvent::LoadingState {
                key: "artist",
                active: false,
            });
        }

        AppCommand::LoadMoodTracks(query) => {
            emit(AppEvent::LoadingState {
                key: "mood",
                active: true,
            });
            if let Ok(tracks) = services.ytmusic.search_songs(&query, 10).await {
                for t in &tracks {
                    services.ytdlp.store_track_meta(t);
                }
                emit(AppEvent::MoodTracksLoaded(tracks));
            }
            emit(AppEvent::LoadingState {
                key: "mood",
                active: false,
            });
        }

        AppCommand::LoadCasterHubCharts(category) => {
            emit(AppEvent::LoadingState {
                key: "casterhub",
                active: true,
            });
            let tracks = services.telemetry.get_global_charts(&category, 25).await;
            emit(AppEvent::CasterHubChartsLoaded(tracks));
            emit(AppEvent::LoadingState {
                key: "casterhub",
                active: false,
            });
        }

        AppCommand::LoadListenerRequests => {
            emit(AppEvent::LoadingState {
                key: "requests",
                active: true,
            });
            let items = services
                .telemetry
                .get_station_listener_requests("pending")
                .await;
            emit(AppEvent::ListenerRequestsLoaded(items));
            emit(AppEvent::LoadingState {
                key: "requests",
                active: false,
            });
        }

        AppCommand::ActionListenerRequest {
            request_id,
            action,
            track_to_queue,
        } => {
            if let Some((track, pos)) = track_to_queue {
                let cfg = services.settings.get_config();
                execute_queue(
                    &services,
                    &cfg,
                    &track,
                    pos,
                    true,
                    &cfg.target_playlist_tab,
                    true,
                    &is_playing_flag,
                    &playlist_cache,
                    &emit,
                )
                .await;
            }
            let _ = services
                .telemetry
                .action_listener_request(&request_id, &action)
                .await;
            let items = services
                .telemetry
                .get_station_listener_requests("pending")
                .await;
            emit(AppEvent::ListenerRequestsLoaded(items));
        }

        AppCommand::LoadDjLocalStats => {
            let chart = services.db.get_dj_top_chart(20);
            let top_artists = services.db.get_top_dj_artists(6);
            let rotation_ready = services.db.get_rotation_ready_tracks(12);
            let mut affinity_recs = Vec::new();
            if let Some(first_artist) = top_artists.first() {
                if let Ok(recs) = services
                    .ytmusic
                    .get_artist_top_tracks(&first_artist.artist, 6)
                    .await
                {
                    affinity_recs = recs;
                }
            }
            emit(AppEvent::DjLocalStatsLoaded {
                chart,
                top_artists,
                rotation_ready,
                affinity_recs,
            });
        }

        AppCommand::LoadPlaylistSets => {
            emit(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
        }

        AppCommand::LoadPlaylistSetItems(set_id) => {
            let items = services.db.get_playlist_set_items(&set_id);
            emit(AppEvent::PlaylistSetItemsLoaded { set_id, items });
        }

        AppCommand::CreatePlaylistSet { name, description } => {
            match services.db.create_playlist_set(&name, &description) {
                Ok(created) => {
                    emit(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
                    emit(AppEvent::Toast {
                        is_error: false,
                        text: format!("Set playlist '{}' berhasil dibuat", created.name),
                    });
                }
                Err(e) => emit(AppEvent::Toast {
                    is_error: true,
                    text: e,
                }),
            }
        }

        AppCommand::DeletePlaylistSet(set_id) => {
            if services.db.delete_playlist_set(&set_id).is_ok() {
                emit(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
            }
        }

        AppCommand::AddTrackToSet { set_id, track } => {
            if let Err(e) = services.db.add_track_to_set(&set_id, &track) {
                emit(AppEvent::Toast {
                    is_error: true,
                    text: e,
                });
            } else {
                emit(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
                emit(AppEvent::PlaylistSetItemsLoaded {
                    set_id: set_id.clone(),
                    items: services.db.get_playlist_set_items(&set_id),
                });
            }
        }

        AppCommand::RemoveTrackFromSet { set_id, item_id } => {
            services.db.remove_track_from_set(&set_id, &item_id);
            emit(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
            emit(AppEvent::PlaylistSetItemsLoaded {
                set_id: set_id.clone(),
                items: services.db.get_playlist_set_items(&set_id),
            });
        }

        AppCommand::MoveSetItem {
            set_id,
            item_id,
            direction,
        } => {
            services.db.move_set_item(&set_id, &item_id, direction);
            emit(AppEvent::PlaylistSetItemsLoaded {
                set_id: set_id.clone(),
                items: services.db.get_playlist_set_items(&set_id),
            });
        }

        AppCommand::ClearPlaylistSet(set_id) => {
            services.db.clear_playlist_set(&set_id);
            emit(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
            emit(AppEvent::PlaylistSetItemsLoaded {
                set_id,
                items: Vec::new(),
            });
        }

        AppCommand::ImportYouTubePlaylist { set_id, url } => {
            emit(AppEvent::LoadingState {
                key: "import_set",
                active: true,
            });
            match services.ytdlp.extract_playlist(&url).await {
                Ok((pl_title, tracks)) => {
                    let count = tracks.len();
                    for t in tracks {
                        let _ = services.db.add_track_to_set(&set_id, &t);
                    }
                    emit(AppEvent::PlaylistSetsLoaded(services.db.get_playlist_sets()));
                    emit(AppEvent::PlaylistSetItemsLoaded {
                        set_id: set_id.clone(),
                        items: services.db.get_playlist_set_items(&set_id),
                    });
                    emit(AppEvent::Toast {
                        is_error: false,
                        text: format!("Berhasil mengimpor {count} lagu dari '{pl_title}'"),
                    });
                }
                Err(e) => emit(AppEvent::Toast {
                    is_error: true,
                    text: e,
                }),
            }
            emit(AppEvent::LoadingState {
                key: "import_set",
                active: false,
            });
        }

        AppCommand::QueueTrack {
            track,
            pos,
            use_cache,
            target_tab,
            skip_repeat_check,
        } => {
            emit(AppEvent::LoadingState {
                key: "queue",
                active: true,
            });
            let cfg = services.settings.get_config();
            execute_queue(
                &services,
                &cfg,
                &track,
                pos,
                use_cache,
                &target_tab,
                skip_repeat_check,
                &is_playing_flag,
                &playlist_cache,
                &emit,
            )
            .await;
            emit(AppEvent::LoadingState {
                key: "queue",
                active: false,
            });
        }

        AppCommand::AutoFillTracks { tracks, pos, label } => {
            emit(AppEvent::LoadingState {
                key: "queue",
                active: true,
            });
            let cfg = services.settings.get_config();
            let total = tracks.len();
            let mut ok_count = 0usize;
            for t in tracks {
                if execute_queue(
                    &services,
                    &cfg,
                    &t,
                    pos,
                    true,
                    &cfg.target_playlist_tab,
                    true,
                    &is_playing_flag,
                    &playlist_cache,
                    &emit,
                )
                .await
                {
                    ok_count += 1;
                }
            }
            emit(AppEvent::Toast {
                is_error: ok_count == 0,
                text: format!("{label}: {ok_count}/{total} lagu berhasil masuk ke antrean RadioBOSS"),
            });
            emit(AppEvent::LoadingState {
                key: "queue",
                active: false,
            });
        }

        AppCommand::StartAudioPreview(track) => {
            let vid = track.video_id.clone();
            let label = format!("{} - {}", track.artists_joined(), track.title);
            services.audio.set_loading(&vid, &label);
            let cfg = services.settings.get_config();
            let fallback_dur = track.duration_seconds.unwrap_or(210) as f32;

            // 1. Check local cache first for 0ms instant headphone preview
            if let Some(local_path) = services.cache.get_cached_file_by_id(&cfg, &vid) {
                services.audio.play_file(&vid, &label, local_path, fallback_dur);
                return;
            }

            // 2. Otherwise stream audio via localhost Axum relay (or direct yt-dlp URL bytes)
            let port = if cfg.server_port == 0 { 8000 } else { cfg.server_port };
            let relay_url = format!("http://127.0.0.1:{port}/api/stream/{vid}.mp3");
            match reqwest::get(&relay_url).await {
                Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                    Ok(bytes) => {
                        services
                            .audio
                            .play_bytes(&vid, &label, bytes.to_vec(), fallback_dur);
                    }
                    Err(e) => services.audio.set_error(format!("Stream error: {e}")),
                },
                _ => services
                    .audio
                    .set_error("Gagal memuat stream pratinjau audio.".to_string()),
            }
        }

        AppCommand::FetchLyrics(track) => {
            emit(AppEvent::LoadingState {
                key: "lyrics",
                active: true,
            });
            let res = services
                .ytmusic
                .get_lyrics_and_talking_points(&track.video_id, Some(&track), &services.db)
                .await;
            emit(AppEvent::LyricsLoaded(res));
            emit(AppEvent::LoadingState {
                key: "lyrics",
                active: false,
            });
        }

        AppCommand::FetchCrowdCleanMetadata(track) => {
            let res = services
                .telemetry
                .get_crowd_clean_metadata(&track.video_id, &track.title, track.primary_artist())
                .await;
            emit(AppEvent::CrowdMetadataLoaded {
                video_id: track.video_id,
                metadata: res,
            });
        }

        AppCommand::SaveSettings(new_cfg) => match services.settings.update_config(new_cfg.clone()) {
            Ok(saved) => {
                emit(AppEvent::ConfigUpdated(saved.clone()));
                let st = services.radioboss.check_status(&saved).await;
                emit(AppEvent::StatusUpdated { status: st.clone() });
                let cstats = services.cache.get_cache_stats(&saved);
                let clist = services.db.get_all_cached_tracks(200);
                emit(AppEvent::CacheStatsUpdated {
                    stats: cstats,
                    cached_tracks: clist,
                });
                emit(AppEvent::Toast {
                    is_error: false,
                    text: if st.connected {
                        "Pengaturan disimpan & terhubung ke RadioBOSS".to_string()
                    } else {
                        "Pengaturan disimpan (RadioBOSS belum terhubung)".to_string()
                    },
                });
            }
            Err(e) => emit(AppEvent::Toast {
                is_error: true,
                text: e,
            }),
        },

        AppCommand::PingRadioBoss(test_cfg) => {
            let st = services.radioboss.check_status(&test_cfg).await;
            emit(AppEvent::PingResult {
                connected: st.connected,
                message: if st.connected {
                    format!(
                        "Terhubung! Status RadioBOSS: {}",
                        st.now_playing
                            .map(|n| n.status.to_uppercase())
                            .unwrap_or_else(|| "OK".into())
                    )
                } else {
                    st.error.unwrap_or_else(|| "Gagal terhubung".to_string())
                },
            });
        }

        AppCommand::RefreshCacheStats => {
            let cfg = services.settings.get_config();
            let stats = services.cache.get_cache_stats(&cfg);
            let cached_list = services.db.get_all_cached_tracks(200);
            let ids: HashSet<String> = cached_list
                .iter()
                .filter(|c| c.is_cached)
                .map(|c| c.video_id.clone())
                .collect();
            emit(AppEvent::CachedIdsUpdated(ids));
            emit(AppEvent::CacheStatsUpdated {
                stats,
                cached_tracks: cached_list,
            });
        }

        AppCommand::TrimCache => {
            let cfg = services.settings.get_config();
            let pruned = services.cache.enforce_cache_limit(&cfg, None);
            let stats = services.cache.get_cache_stats(&cfg);
            let cached_list = services.db.get_all_cached_tracks(200);
            emit(AppEvent::CacheStatsUpdated {
                stats,
                cached_tracks: cached_list,
            });
            emit(AppEvent::Toast {
                is_error: false,
                text: format!("Pembersihan otomatis selesai: {pruned} file dihapus"),
            });
        }

        AppCommand::ClearCache => {
            let cfg = services.settings.get_config();
            let deleted = services.cache.clear_cache(&cfg, None);
            let stats = services.cache.get_cache_stats(&cfg);
            emit(AppEvent::CachedIdsUpdated(HashSet::new()));
            emit(AppEvent::CacheStatsUpdated {
                stats,
                cached_tracks: Vec::new(),
            });
            emit(AppEvent::Toast {
                is_error: false,
                text: format!("{deleted} file audio cache dihapus"),
            });
        }

        AppCommand::DeleteCachedFile(video_id) => {
            let cfg = services.settings.get_config();
            if let Some(item) = services.db.get_cached_track(&video_id) {
                if let Some(ref fp) = item.file_path {
                    let p = std::path::PathBuf::from(fp);
                    let _ = std::fs::remove_file(&p);
                    let _ = std::fs::remove_file(p.with_extension("jpg"));
                }
            }
            services.db.mark_video_evicted(&video_id);
            let stats = services.cache.get_cache_stats(&cfg);
            let cached_list = services.db.get_all_cached_tracks(200);
            let ids: HashSet<String> = cached_list
                .iter()
                .filter(|c| c.is_cached)
                .map(|c| c.video_id.clone())
                .collect();
            emit(AppEvent::CachedIdsUpdated(ids));
            emit(AppEvent::CacheStatsUpdated {
                stats,
                cached_tracks: cached_list,
            });
        }

        AppCommand::CheckForUpdates { manual } => {
            emit(AppEvent::LoadingState {
                key: "update_check",
                active: true,
            });
            let res = services.update.check_for_updates().await;
            emit(AppEvent::UpdateChecked {
                result: res,
                manual,
            });
            emit(AppEvent::LoadingState {
                key: "update_check",
                active: false,
            });
        }

        AppCommand::DownloadUpdate(asset) => {
            let upd = services.update.clone();
            let emit_dl = emit.clone();
            let updater_poller = services.update.clone();
            let done_flag = Arc::new(AtomicBool::new(false));
            let done_clone = done_flag.clone();

            tokio::spawn(async move {
                while !done_clone.load(Ordering::Relaxed) {
                    emit_dl(AppEvent::UpdateDownloadProgress(
                        updater_poller.get_download_status(),
                    ));
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
                emit_dl(AppEvent::UpdateDownloadProgress(
                    updater_poller.get_download_status(),
                ));
            });

            upd.start_download(asset).await;
            done_flag.store(true, Ordering::Relaxed);
        }

        AppCommand::InstallUpdate => {
            if let Err(e) = services.update.install_downloaded_update() {
                emit(AppEvent::Toast {
                    is_error: true,
                    text: e,
                });
            }
        }

        AppCommand::ClearHistory => {
            services.db.clear_history();
            emit(AppEvent::HistoryLoaded(Vec::new()));
        }

        AppCommand::TriggerTelemetrySync => {
            let ok = services.telemetry.sync_outbox_to_casterhub().await;
            emit(AppEvent::SessionStatsUpdated {
                stats: services.telemetry.get_session_stats(),
                station_hash: services.telemetry.station_hash.clone(),
            });
            emit(AppEvent::Toast {
                is_error: !ok,
                text: if ok {
                    "Telemetri CasterHub tersinkron".to_string()
                } else {
                    "Gagal menyinkronkan ke server CasterHub".to_string()
                },
            });
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn execute_queue(
    services: &BackendContext,
    cfg: &AppConfig,
    track: &TrackItem,
    pos: i32,
    use_cache: bool,
    target_tab: &str,
    skip_repeat_check: bool,
    is_playing_flag: &Arc<AtomicBool>,
    playlist_cache: &Arc<std::sync::Mutex<Vec<PlaylistItem>>>,
    emit: &(impl Fn(AppEvent) + Send + Sync + Clone + 'static),
) -> bool {
    // 1. Anti-Repeat Guard
    if !skip_repeat_check {
        let lower_title = track.title.to_lowercase();
        let in_playlist = playlist_cache
            .lock()
            .unwrap()
            .iter()
            .any(|p| p.display_title.to_lowercase().contains(&lower_title));
        if in_playlist {
            emit(AppEvent::ConfirmRepeatQueue {
                track: track.clone(),
                pos,
                target_tab: target_tab.to_string(),
                reason: format!(
                    "Lagu '{}' sudah ada di antrean aktif RadioBOSS.",
                    track.title
                ),
            });
            return false;
        }
    }

    // 2. Switch target RadioBOSS tab if configured
    let eff_tab = if target_tab.is_empty() {
        cfg.target_playlist_tab.as_str()
    } else {
        target_tab
    };
    if !eff_tab.is_empty() {
        let _ = services.radioboss.switch_playlist_tab(cfg, eff_tab).await;
    }

    // 3. Prepare Studio Master Cache MP3 or resolve stream relay
    services.ytdlp.store_track_meta(track);
    let mut cached_file_size = 0u64;
    let mut is_from_cache = false;
    let filename_for_rb = if use_cache {
        if let Some(mp3_path) = services.cache.prepare_studio_cache(cfg, track).await {
            cached_file_size = std::fs::metadata(&mp3_path).map(|m| m.len()).unwrap_or(0);
            is_from_cache = true;
            if RadioBossService::is_local_instance(cfg) {
                mp3_path.to_string_lossy().to_string()
            } else {
                services
                    .radioboss
                    .get_reachable_stream_url(cfg, &track.video_id)
            }
        } else {
            services
                .radioboss
                .get_reachable_stream_url(cfg, &track.video_id)
        }
    } else {
        services
            .radioboss
            .get_reachable_stream_url(cfg, &track.video_id)
    };

    // 4. Smart Play Next position routing (-2 if playing, 1 if stopped)
    let effective_pos = if pos == 1 || pos == -2 {
        if is_playing_flag.load(Ordering::Relaxed) {
            -2
        } else {
            1
        }
    } else {
        pos
    };

    let formatted_title = cfg.format_title(&track.artists_joined(), &track.title);
    let res = services
        .radioboss
        .insert_track(cfg, &filename_for_rb, effective_pos, Some(&formatted_title))
        .await;

    let success = res.is_ok();
    let hist_item = HistoryItem {
        id: uuid::Uuid::new_v4().to_string(),
        video_id: track.video_id.clone(),
        title: track.title.clone(),
        artists: track.artists.clone(),
        thumbnail_url: track.thumbnail_url.clone(),
        pos,
        timestamp: Local::now().format("%H:%M:%S").to_string(),
        status: if success {
            "success".to_string()
        } else {
            "failed".to_string()
        },
    };
    services.db.add_history_item(&hist_item);
    emit(AppEvent::HistoryLoaded(services.db.get_history(100)));

    match res {
        Ok(_) => {
            if !is_from_cache {
                services.db.record_track_play(track, None, 0, false);
            }
            let cleaned = clean_broadcast_title(&track.title);
            let action_type = if pos == 1 || pos == -2 {
                "play_next"
            } else {
                "queue_bottom"
            };
            services.telemetry.enqueue_airplay_event(
                track,
                &cleaned,
                track.primary_artist(),
                action_type,
                is_from_cache,
                cached_file_size,
            );
            emit(AppEvent::QueueCompleted {
                video_id: track.video_id.clone(),
            });
            emit(AppEvent::Toast {
                is_error: false,
                text: format!("Masuk antrean RadioBOSS: {}", formatted_title),
            });

            // Refresh playlist immediately
            if let Ok(pl) = services.radioboss.get_playlist(cfg, 50).await {
                *playlist_cache.lock().unwrap() = pl.clone();
                emit(AppEvent::PlaylistUpdated { tracks: pl });
            }
            let cstats = services.cache.get_cache_stats(cfg);
            let clist = services.db.get_all_cached_tracks(200);
            let ids: HashSet<String> = clist
                .iter()
                .filter(|c| c.is_cached)
                .map(|c| c.video_id.clone())
                .collect();
            emit(AppEvent::CachedIdsUpdated(ids));
            emit(AppEvent::CacheStatsUpdated {
                stats: cstats,
                cached_tracks: clist,
            });
            true
        }
        Err(e) => {
            emit(AppEvent::Toast {
                is_error: true,
                text: e,
            });
            false
        }
    }
}
