use std::collections::HashSet;

use crate::models::casterhub::{
    CasterHubChartTrack, CasterHubCrowdMetadata, CasterHubListenerRequest, CasterHubSessionStats,
};
use crate::models::config::AppConfig;
use crate::models::radioboss::{PlaybackAction, PlaylistItem, RadioBossStatus, TabsResponse};
use crate::models::system::{SystemSpecs, UpdateAsset, UpdateCheckResult, UpdateDownloadStatus};
use crate::models::track::{
    CacheStats, CachedTrackItem, DjArtistStat, HistoryItem, LyricsResponse, PlaylistSet,
    PlaylistSetItem, TrackItem,
};

#[derive(Debug, Clone)]
pub enum AppCommand {
    SyncStatus {
        silent: bool,
    },
    SyncPlaylist {
        manual: bool,
        override_tab: Option<String>,
    },
    SyncTabs {
        notify: bool,
    },
    SelectPlaylistTab(String),
    PlaybackControl(PlaybackAction),
    SetLiveCastTitle(String),
    SetAutoRefresh(bool),
    SearchSongs(String),
    ResolveUrl(String),
    LoadRecommendations(String),
    LoadArtistTracks(String),
    LoadMoodTracks(String),
    LoadCasterHubCharts(String),
    LoadListenerRequests,
    ActionListenerRequest {
        request_id: String,
        action: String,
        track_to_queue: Option<(TrackItem, i32)>,
    },
    LoadDjLocalStats,
    LoadPlaylistSets,
    LoadPlaylistSetItems(String),
    CreatePlaylistSet {
        name: String,
        description: String,
    },
    DeletePlaylistSet(String),
    AddTrackToSet {
        set_id: String,
        track: TrackItem,
    },
    RemoveTrackFromSet {
        set_id: String,
        item_id: String,
    },
    MoveSetItem {
        set_id: String,
        item_id: String,
        direction: i32,
    },
    ClearPlaylistSet(String),
    ImportYouTubePlaylist {
        set_id: String,
        url: String,
    },
    QueueTrack {
        track: TrackItem,
        pos: i32,
        use_cache: bool,
        target_tab: String,
        skip_repeat_check: bool,
    },
    AutoFillTracks {
        tracks: Vec<TrackItem>,
        pos: i32,
        label: String,
    },
    StartAudioPreview(TrackItem),
    FetchLyrics(TrackItem),
    FetchCrowdCleanMetadata(TrackItem),
    SaveSettings(AppConfig),
    PingRadioBoss(AppConfig),
    RefreshCacheStats,
    TrimCache,
    ClearCache,
    DeleteCachedFile(String),
    CheckForUpdates {
        manual: bool,
    },
    DownloadUpdate(UpdateAsset),
    InstallUpdate,
    ClearHistory,
    TriggerTelemetrySync,
}

#[derive(Debug, Clone)]
pub enum AppEvent {
    StatusUpdated {
        status: RadioBossStatus,
    },
    PlaylistUpdated {
        tracks: Vec<PlaylistItem>,
    },
    TabsUpdated {
        tabs: TabsResponse,
        notify: bool,
    },
    SearchResults {
        results: Vec<TrackItem>,
    },
    UrlResolved {
        track: TrackItem,
        queued_playlist_tracks: Option<Vec<TrackItem>>,
    },
    RecommendationsLoaded(Vec<TrackItem>),
    ArtistTracksLoaded(Vec<TrackItem>),
    MoodTracksLoaded(Vec<TrackItem>),
    CasterHubChartsLoaded(Vec<CasterHubChartTrack>),
    ListenerRequestsLoaded(Vec<CasterHubListenerRequest>),
    DjLocalStatsLoaded {
        chart: Vec<CachedTrackItem>,
        top_artists: Vec<DjArtistStat>,
        rotation_ready: Vec<CachedTrackItem>,
        affinity_recs: Vec<TrackItem>,
    },
    PlaylistSetsLoaded(Vec<PlaylistSet>),
    PlaylistSetItemsLoaded {
        set_id: String,
        items: Vec<PlaylistSetItem>,
    },
    HistoryLoaded(Vec<HistoryItem>),
    ConfigUpdated(AppConfig),
    PingResult {
        connected: bool,
        message: String,
    },
    CacheStatsUpdated {
        stats: CacheStats,
        cached_tracks: Vec<CachedTrackItem>,
    },
    SystemSpecsLoaded(SystemSpecs),
    CachedIdsUpdated(HashSet<String>),
    LyricsLoaded(LyricsResponse),
    CrowdMetadataLoaded {
        video_id: String,
        metadata: Option<CasterHubCrowdMetadata>,
    },
    SessionStatsUpdated {
        stats: CasterHubSessionStats,
        station_hash: String,
    },
    UpdateChecked {
        result: UpdateCheckResult,
        manual: bool,
    },
    UpdateDownloadProgress(UpdateDownloadStatus),
    ConfirmRepeatQueue {
        track: TrackItem,
        pos: i32,
        target_tab: String,
        reason: String,
    },
    QueueCompleted {
        video_id: String,
    },
    LoadingState {
        key: &'static str,
        active: bool,
    },
    Toast {
        is_error: bool,
        text: String,
    },
}
