use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use eframe::egui::{self, ScrollArea, TextureHandle};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

use crate::events::{AppCommand, AppEvent};
use crate::models::casterhub::{
    CasterHubChartTrack, CasterHubCrowdMetadata, CasterHubListenerRequest, CasterHubSessionStats,
};
use crate::models::config::AppConfig;
use crate::models::radioboss::{PlaylistItem, RadioBossStatus};
use crate::models::system::{SystemSpecs, UpdateCheckResult, UpdateDownloadStatus};
use crate::models::track::{
    CacheStats, CachedTrackItem, DjArtistStat, HistoryItem, LyricsResponse, PlaylistSet,
    PlaylistSetItem, TrackItem,
};
use crate::models::APP_VERSION;
use crate::services::audio_player::AudioPlayerService;
use crate::ui::theme::{
    configure_studio_theme, mono_text, semibold_text, AMBER_PRIMARY, BORDER_COLOR, CHASSIS_BG,
    TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};
use crate::ui::toast::{render_toasts, ToastItem};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogMainTab {
    Recommendations,
    PlaylistSets,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecSubTab {
    UpNext,
    Artist,
    GlobalCharts,
    ListenerInbox,
    DjTopChart,
    DjSmartRotation,
    Moods,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueueMonitorTab {
    Playlist,
    History,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsTab {
    Connection,
    Broadcast,
    Storage,
    CasterHub,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LyricsModalTab {
    CueSheet,
    Lyrics,
}

#[derive(Debug, Clone)]
pub struct PendingConfirmRepeat {
    pub track: TrackItem,
    pub pos: i32,
    pub target_tab: String,
    pub reason: String,
}

pub struct RadioCasterApp {
    pub cmd_tx: UnboundedSender<AppCommand>,
    pub evt_rx: UnboundedReceiver<AppEvent>,
    pub audio: AudioPlayerService,

    // Connection & RadioBOSS State
    pub config: AppConfig,
    pub draft_config: AppConfig,
    pub rb_status: RadioBossStatus,
    pub playlist_tracks: Vec<PlaylistItem>,
    pub available_tabs: Vec<String>,
    pub active_tab: String,
    pub is_tabs_synced: bool,

    // Live Cast Title inline editor
    pub is_editing_cast_title: bool,
    pub cast_title_input: String,

    // Discovery & Omnibox
    pub omnibox_input: String,
    pub search_results: Vec<TrackItem>,
    pub selected_track: Option<TrackItem>,
    pub edit_title: String,
    pub edit_artist: String,
    pub use_studio_cache: bool,
    pub crowd_meta_cache: HashMap<String, CasterHubCrowdMetadata>,

    // Catalog & Recommendations
    pub catalog_tab: CatalogMainTab,
    pub rec_sub_tab: RecSubTab,
    pub recommendations: Vec<TrackItem>,
    pub artist_tracks: Vec<TrackItem>,
    pub mood_tracks: Vec<TrackItem>,
    pub selected_mood_id: String,
    pub casterhub_category: String,
    pub casterhub_charts: Vec<CasterHubChartTrack>,
    pub listener_requests: Vec<CasterHubListenerRequest>,
    pub dj_chart: Vec<CachedTrackItem>,
    pub dj_top_artists: Vec<DjArtistStat>,
    pub dj_rotation_ready: Vec<CachedTrackItem>,
    pub dj_affinity_recs: Vec<TrackItem>,

    // Playlist Sets (SQLite)
    pub playlist_sets: Vec<PlaylistSet>,
    pub active_set_id: Option<String>,
    pub active_set_items: Vec<PlaylistSetItem>,
    pub new_set_name: String,
    pub new_set_desc: String,
    pub import_playlist_url: String,
    pub set_filter_query: String,
    pub show_create_set_form: bool,
    pub add_to_set_picker_track: Option<TrackItem>,

    // Queue Monitor & History
    pub queue_tab: QueueMonitorTab,
    pub history: Vec<HistoryItem>,
    pub cached_video_ids: HashSet<String>,

    // Telemetry & System
    pub session_stats: CasterHubSessionStats,
    pub station_hash: String,
    pub cache_stats: CacheStats,
    pub cached_tracks_list: Vec<CachedTrackItem>,
    pub system_specs: Option<SystemSpecs>,
    pub ping_result: Option<(bool, String)>,

    // Modals & Overlays
    pub is_settings_open: bool,
    pub settings_tab: SettingsTab,
    pub show_rb_password: bool,
    pub is_lyrics_open: bool,
    pub lyrics_modal_tab: LyricsModalTab,
    pub lyrics_data: Option<LyricsResponse>,
    pub is_update_open: bool,
    pub update_check: Option<UpdateCheckResult>,
    pub update_dl_status: UpdateDownloadStatus,
    pub pending_repeat: Option<PendingConfirmRepeat>,
    pub toasts: Vec<ToastItem>,
    pub loading_keys: HashSet<String>,
    pub logo_texture: Option<TextureHandle>,
    pub last_seed_video_id: Option<String>,
    pub last_seed_artist: Option<String>,
}

impl RadioCasterApp {
    pub fn new(
        cc: &eframe::CreationContext<'_>,
        cmd_tx: UnboundedSender<AppCommand>,
        evt_rx: UnboundedReceiver<AppEvent>,
        audio: AudioPlayerService,
    ) -> Self {
        configure_studio_theme(&cc.egui_ctx);
        egui_extras::install_image_loaders(&cc.egui_ctx);

        let logo_texture = load_logo_texture(&cc.egui_ctx);

        // Kick off initial mood & global chart data immediately
        let _ = cmd_tx.send(AppCommand::LoadMoodTracks(
            "indonesia pop hits upbeat semangat".to_string(),
        ));
        let _ = cmd_tx.send(AppCommand::LoadDjLocalStats);

        Self {
            cmd_tx,
            evt_rx,
            audio,
            config: AppConfig::default(),
            draft_config: AppConfig::default(),
            rb_status: RadioBossStatus::default(),
            playlist_tracks: Vec::new(),
            available_tabs: vec!["Playlist 1".to_string()],
            active_tab: String::new(),
            is_tabs_synced: false,
            is_editing_cast_title: false,
            cast_title_input: String::new(),
            omnibox_input: String::new(),
            search_results: Vec::new(),
            selected_track: None,
            edit_title: String::new(),
            edit_artist: String::new(),
            use_studio_cache: true,
            crowd_meta_cache: HashMap::new(),
            catalog_tab: CatalogMainTab::Recommendations,
            rec_sub_tab: RecSubTab::UpNext,
            recommendations: Vec::new(),
            artist_tracks: Vec::new(),
            mood_tracks: Vec::new(),
            selected_mood_id: "morning".to_string(),
            casterhub_category: "top50".to_string(),
            casterhub_charts: Vec::new(),
            listener_requests: Vec::new(),
            dj_chart: Vec::new(),
            dj_top_artists: Vec::new(),
            dj_rotation_ready: Vec::new(),
            dj_affinity_recs: Vec::new(),
            playlist_sets: Vec::new(),
            active_set_id: None,
            active_set_items: Vec::new(),
            new_set_name: String::new(),
            new_set_desc: String::new(),
            import_playlist_url: String::new(),
            set_filter_query: String::new(),
            show_create_set_form: false,
            add_to_set_picker_track: None,
            queue_tab: QueueMonitorTab::Playlist,
            history: Vec::new(),
            cached_video_ids: HashSet::new(),
            session_stats: CasterHubSessionStats::default(),
            station_hash: String::new(),
            cache_stats: CacheStats::default(),
            cached_tracks_list: Vec::new(),
            system_specs: None,
            ping_result: None,
            is_settings_open: false,
            settings_tab: SettingsTab::Connection,
            show_rb_password: false,
            is_lyrics_open: false,
            lyrics_modal_tab: LyricsModalTab::CueSheet,
            lyrics_data: None,
            is_update_open: false,
            update_check: None,
            update_dl_status: UpdateDownloadStatus::default(),
            pending_repeat: None,
            toasts: Vec::new(),
            loading_keys: HashSet::new(),
            logo_texture,
            last_seed_video_id: None,
            last_seed_artist: None,
        }
    }

    pub fn is_loading(&self, key: &str) -> bool {
        self.loading_keys.contains(key)
    }

    pub fn send_cmd(&self, cmd: AppCommand) {
        let _ = self.cmd_tx.send(cmd);
    }

    pub fn select_track(&mut self, track: TrackItem) {
        self.edit_title = track.title.clone();
        self.edit_artist = track.artists_joined();
        let vid = track.video_id.clone();
        let artist = track.primary_artist().to_string();

        self.selected_track = Some(track.clone());

        if self.last_seed_video_id.as_deref() != Some(&vid) {
            self.last_seed_video_id = Some(vid);
            self.send_cmd(AppCommand::LoadRecommendations(track.video_id.clone()));
            if self.config.enable_crowd_metadata {
                self.send_cmd(AppCommand::FetchCrowdCleanMetadata(track.clone()));
            }
        }

        if !artist.is_empty()
            && artist != "Unknown Artist"
            && self.last_seed_artist.as_deref() != Some(&artist)
        {
            self.last_seed_artist = Some(artist.clone());
            self.send_cmd(AppCommand::LoadArtistTracks(artist));
        }
    }

    fn process_events(&mut self) {
        while let Ok(evt) = self.evt_rx.try_recv() {
            match evt {
                AppEvent::StatusUpdated { status } => {
                    self.rb_status = status;
                }
                AppEvent::PlaylistUpdated { tracks } => {
                    self.playlist_tracks = tracks;
                }
                AppEvent::TabsUpdated { tabs, notify } => {
                    if !tabs.available_tabs.is_empty() {
                        self.available_tabs = tabs.available_tabs.clone();
                    }
                    self.is_tabs_synced = tabs.is_synced;
                    if self.active_tab.is_empty() && !tabs.active_tab.is_empty() {
                        // keep auto mode or reflect synced active
                    }
                    if notify {
                        self.toasts.push(ToastItem::success(format!(
                            "Tersinkron {} tab playlist RadioBOSS",
                            self.available_tabs.len()
                        )));
                    }
                }
                AppEvent::SearchResults { results } => {
                    self.search_results = results;
                }
                AppEvent::UrlResolved {
                    track,
                    queued_playlist_tracks,
                } => {
                    if let Some(pl_tracks) = queued_playlist_tracks {
                        self.search_results = pl_tracks.clone();
                    }
                    self.select_track(track);
                }
                AppEvent::RecommendationsLoaded(tracks) => {
                    self.recommendations = tracks;
                }
                AppEvent::ArtistTracksLoaded(tracks) => {
                    self.artist_tracks = tracks;
                }
                AppEvent::MoodTracksLoaded(tracks) => {
                    self.mood_tracks = tracks;
                }
                AppEvent::CasterHubChartsLoaded(tracks) => {
                    self.casterhub_charts = tracks;
                }
                AppEvent::ListenerRequestsLoaded(reqs) => {
                    self.listener_requests = reqs;
                }
                AppEvent::DjLocalStatsLoaded {
                    chart,
                    top_artists,
                    rotation_ready,
                    affinity_recs,
                } => {
                    self.dj_chart = chart;
                    self.dj_top_artists = top_artists;
                    self.dj_rotation_ready = rotation_ready;
                    self.dj_affinity_recs = affinity_recs;
                }
                AppEvent::PlaylistSetsLoaded(sets) => {
                    self.playlist_sets = sets;
                    if self.active_set_id.is_none() {
                        if let Some(first) = self.playlist_sets.first() {
                            self.active_set_id = Some(first.id.clone());
                            self.send_cmd(AppCommand::LoadPlaylistSetItems(first.id.clone()));
                        }
                    }
                }
                AppEvent::PlaylistSetItemsLoaded { set_id, items } => {
                    if self.active_set_id.as_deref() == Some(&set_id) {
                        self.active_set_items = items;
                    }
                }
                AppEvent::HistoryLoaded(hist) => {
                    self.history = hist;
                }
                AppEvent::ConfigUpdated(cfg) => {
                    self.active_tab = cfg.target_playlist_tab.clone();
                    if !cfg.available_playlist_tabs.is_empty() && !self.is_tabs_synced {
                        self.available_tabs = cfg.available_playlist_tabs.clone();
                    }
                    self.config = cfg.clone();
                    if !self.is_settings_open {
                        self.draft_config = cfg;
                    }
                }
                AppEvent::PingResult { connected, message } => {
                    self.ping_result = Some((connected, message));
                }
                AppEvent::CacheStatsUpdated {
                    stats,
                    cached_tracks,
                } => {
                    self.cache_stats = stats;
                    self.cached_tracks_list = cached_tracks;
                }
                AppEvent::SystemSpecsLoaded(specs) => {
                    self.system_specs = Some(specs);
                }
                AppEvent::CachedIdsUpdated(ids) => {
                    self.cached_video_ids = ids;
                }
                AppEvent::LyricsLoaded(res) => {
                    self.lyrics_data = Some(res);
                    self.is_lyrics_open = true;
                }
                AppEvent::CrowdMetadataLoaded { video_id, metadata } => {
                    if let Some(meta) = metadata {
                        self.crowd_meta_cache.insert(video_id, meta);
                    }
                }
                AppEvent::SessionStatsUpdated {
                    stats,
                    station_hash,
                } => {
                    self.session_stats = stats;
                    self.station_hash = station_hash;
                }
                AppEvent::UpdateChecked { result, manual } => {
                    if manual && !result.update_available && result.error.is_none() {
                        self.toasts.push(ToastItem::success(format!(
                            "Aplikasi sudah versi terbaru (v{})",
                            APP_VERSION
                        )));
                    }
                    self.update_check = Some(result);
                }
                AppEvent::UpdateDownloadProgress(st) => {
                    self.update_dl_status = st;
                }
                AppEvent::ConfirmRepeatQueue {
                    track,
                    pos,
                    target_tab,
                    reason,
                } => {
                    self.pending_repeat = Some(PendingConfirmRepeat {
                        track,
                        pos,
                        target_tab,
                        reason,
                    });
                }
                AppEvent::QueueCompleted { .. } => {
                    self.send_cmd(AppCommand::LoadDjLocalStats);
                }
                AppEvent::LoadingState { key, active } => {
                    if active {
                        self.loading_keys.insert(key.to_string());
                    } else {
                        self.loading_keys.remove(key);
                    }
                }
                AppEvent::Toast { is_error, text } => {
                    if is_error {
                        self.toasts.push(ToastItem::error(text));
                    } else {
                        self.toasts.push(ToastItem::success(text));
                    }
                }
            }
        }
    }
}

impl eframe::App for RadioCasterApp {
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.process_events();

        let audio_state = self.audio.get_state();
        if audio_state.is_playing || audio_state.is_loading {
            ctx.request_repaint_after(std::time::Duration::from_millis(120));
        }
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let audio_state = self.audio.get_state();

        // Top Rack Bar (Zone 1)
        egui::Panel::top("zone1_top_rack")
            .frame(
                egui::Frame::NONE
                    .fill(CHASSIS_BG)
                    .inner_margin(egui::Margin::symmetric(14, 10)),
            )
            .show(ui, |ui| {
                crate::ui::top_rack::render_top_rack(ui, self);
            });

        // Studio Console Footer
        egui::Panel::bottom("studio_footer")
            .frame(
                egui::Frame::NONE
                    .fill(CHASSIS_BG)
                    .stroke(egui::Stroke::new(1.0, BORDER_COLOR))
                    .inner_margin(egui::Margin::symmetric(16, 8)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(semibold_text("Radio Caster Bridge Studio", 11.5, TEXT_SECONDARY));
                    ui.label(mono_text("•", 11.5, TEXT_MUTED));
                    ui.label(mono_text(format!("v{APP_VERSION}"), 11.5, TEXT_MUTED));
                    if self.session_stats.session_seconds > 0
                        || self.session_stats.lifetime_airtime_hours > 0.0
                    {
                        ui.label(mono_text("•", 11.5, TEXT_MUTED));
                        ui.label(mono_text(
                            format!(
                                "Jam Terbang: {:.1}j • Sesi: {} ({} lagu)",
                                self.session_stats.lifetime_airtime_hours,
                                self.session_stats.session_time_formatted,
                                self.session_stats.songs_today
                            ),
                            11.5,
                            AMBER_PRIMARY,
                        ));
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .link(semibold_text("Tayen (hi.oktaa.my.id)", 11.5, TEXT_PRIMARY))
                            .clicked()
                        {
                            crate::services::system_service::open_in_system("https://hi.oktaa.my.id");
                        }
                        ui.label(semibold_text("Copyright © 2026 RCB Studio •", 11.5, TEXT_MUTED));
                    });
                });
            });

        // Central 2-Column Broadcast Workbench (Zone 2 Left 7/12 + Zone 3 Right 5/12)
        egui::CentralPanel::default()
            .frame(
                egui::Frame::NONE
                    .fill(CHASSIS_BG)
                    .inner_margin(egui::Margin::symmetric(14, 6)),
            )
            .show(ui, |ui| {
                let total_w = ui.available_width();
                let total_h = ui.available_height();
                let gap = 14.0;
                let left_w = ((total_w - gap) * (7.0 / 12.0)).max(360.0);
                let right_w = (total_w - gap - left_w).max(300.0);

                ui.horizontal_top(|ui| {
                    // ZONE 2: Left Discovery & Catalog Deck
                    ui.allocate_ui_with_layout(
                        egui::vec2(left_w, total_h),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            ScrollArea::vertical()
                                .id_salt("zone2_scroll")
                                .auto_shrink([false, false])
                                .show(ui, |ui| {
                                    crate::ui::discovery_deck::render_discovery_deck(ui, self);
                                    ui.add_space(12.0);
                                    match self.catalog_tab {
                                        CatalogMainTab::Recommendations => {
                                            crate::ui::recommendations::render_recommendations(
                                                ui, self,
                                            );
                                        }
                                        CatalogMainTab::PlaylistSets => {
                                            crate::ui::playlist_sets::render_playlist_sets(
                                                ui, self,
                                            );
                                        }
                                    }
                                    ui.add_space(8.0);
                                });
                        },
                    );

                    ui.add_space(gap);

                    // ZONE 3: Right Cue & Live Queue Monitor
                    ui.allocate_ui_with_layout(
                        egui::vec2(right_w, total_h),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            ScrollArea::vertical()
                                .id_salt("zone3_scroll")
                                .auto_shrink([false, false])
                                .show(ui, |ui| {
                                    crate::ui::cue_deck::render_cue_deck(ui, self, &audio_state);
                                    ui.add_space(12.0);
                                    crate::ui::queue_monitor::render_queue_monitor(ui, self);
                                    ui.add_space(8.0);
                                });
                        },
                    );
                });
            });

        // Modals & Overlays
        crate::ui::modals::settings_modal::render_settings_modal(&ctx, self);
        crate::ui::modals::lyrics_modal::render_lyrics_modal(&ctx, self);
        crate::ui::modals::update_modal::render_update_modal(&ctx, self);
        crate::ui::modals::confirm_modal::render_confirm_modals(&ctx, self);
        render_toasts(&ctx, &mut self.toasts);
    }
}

fn load_logo_texture(ctx: &egui::Context) -> Option<TextureHandle> {
    let bytes = include_bytes!("../assets/logo.png");
    let img = image::load_from_memory(bytes).ok()?;
    let rgba = img.to_rgba8();
    let size = [rgba.width() as usize, rgba.height() as usize];
    let color_img = egui::ColorImage::from_rgba_unmultiplied(size, rgba.as_raw());
    Some(ctx.load_texture("rcb_logo", color_img, egui::TextureOptions::LINEAR))
}

pub fn format_float_time(secs: f32) -> String {
    let s = secs.max(0.0) as u64;
    let m = s / 60;
    let rem = s % 60;
    format!("{m:02}:{rem:02}")
}

pub fn load_app_icon_data() -> Option<Arc<egui::IconData>> {
    let bytes = include_bytes!("../assets/logo.png");
    let img = image::load_from_memory(bytes).ok()?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    Some(Arc::new(egui::IconData {
        rgba: rgba.into_raw(),
        width: w,
        height: h,
    }))
}
