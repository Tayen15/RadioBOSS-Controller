/**
 * Type definitions for Radio Caster Request Bridge Frontend.
 */

export const APP_VERSION = "0.9.0";

export interface TrackItem {
  video_id: string;
  title: string;
  artists: string[];
  album?: string | null;
  duration_seconds?: number | null;
  duration_formatted?: string | null;
  thumbnail_url?: string | null;
  url: string;
  year?: string | null;
  genre?: string | null;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  results: TrackItem[];
}

export interface ResolveResponse {
  success: boolean;
  data?: TrackItem | null;
  direct_stream_url?: string | null;
  relay_stream_url?: string | null;
  error?: string | null;
}

export interface QueueResponse {
  success: boolean;
  message: string;
  inserted_pos: number;
  track_title: string;
  stream_url: string;
}

export interface NowPlayingTrack {
  title: string;
  duration?: string | null;
  position?: string | null;
  status: string; // 'playing' | 'paused' | 'stopped'
  listeners?: number;
}

export interface RadioBOSSStatus {
  connected: boolean;
  now_playing?: NowPlayingTrack | null;
  raw_status?: string | null;
  error?: string | null;
}

export interface HistoryItem {
  id: string;
  video_id: string;
  title: string;
  artists: string[];
  thumbnail_url?: string | null;
  pos: number; // -1 for Bottom, 1 for Play Next
  timestamp: string;
  status: "success" | "failed";
}

export type TitleFormatMode =
  | "radioboss_native"
  | "artist_title"
  | "title_artist"
  | "title_only"
  | "custom";

export interface AppConfig {
  radioboss_host: string;
  radioboss_port: number;
  radioboss_password: string;
  title_format_mode: TitleFormatMode;
  custom_title_format: string;
  server_port: number;
  audio_quality?: "128k" | "192k" | "256k" | "320k";
  enable_loudnorm?: boolean;
  custom_cache_dir?: string;
  custom_data_dir?: string;
  max_cache_size_mb?: number;
  auto_cleanup_cache?: boolean;
  target_playlist_tab?: string;
  available_playlist_tabs?: string[];
}

export interface BrowseFolderResponse {
  success: boolean;
  path?: string | null;
  cancelled?: boolean;
  error?: string | null;
}

export interface CartItem {
  id: number;
  label: string;
  sublabel: string;
  category: "jingle" | "sweeper" | "sfx" | "bed";
  color: "primary" | "secondary" | "accent" | "warning" | "info";
  shortcut?: string;
}

export interface SaveSettingsResponse {
  success: boolean;
  message: string;
  connected: boolean;
  config: AppConfig;
}

export type PlaybackAction = "play" | "pause" | "stop" | "next";

export interface PlaybackControlResponse {
  success: boolean;
  message: string;
  action: PlaybackAction;
}

export interface PlaylistItem {
  index: number;
  artist: string;
  title: string;
  display_title: string;
  duration: string;
  start_time: string;
  filename: string;
  is_playing: boolean;
}

export interface PlaylistResponse {
  success: boolean;
  count: number;
  tracks: PlaylistItem[];
  error?: string | null;
}

export interface CacheStats {
  cache_dir: string;
  storage_dir?: string;
  db_path?: string;
  total_files: number;
  total_size_bytes: number;
  total_size_mb: number;
  max_cache_size_mb?: number;
  used_percent?: number;
  auto_cleanup_cache?: boolean;
}

export interface SongTrivia {
  title?: string;
  artist?: string;
  album?: string;
  release_year?: string;
  duration?: string;
  play_count?: number;
}

export interface TalkingPoints {
  intro_talk_window: string;
  outro_talk_window: string;
  station_id_cue?: string;
  vibe?: string;
  vibe_badge?: string;
  vibe_category?: string;
  key_lyric_quote?: string;
  intro_script?: string;
  outro_script?: string;
  broadcaster_tips: string[];
  song_trivia?: SongTrivia;
}

export interface LyricsResponse {
  video_id: string;
  has_lyrics: boolean;
  lyrics: string;
  source: string;
  talking_points: TalkingPoints;
}

export interface RecommendationsResponse {
  success: boolean;
  seed_video_id: string;
  results: TrackItem[];
}

export interface ArtistTopTracksResponse {
  success: boolean;
  artist: string;
  results: TrackItem[];
}

export interface MoodTracksResponse {
  success: boolean;
  mood: string;
  results: TrackItem[];
}

export interface PlaylistSetItem {
  id: string;
  set_id: string;
  video_id: string;
  title: string;
  artists: string[];
  album?: string | null;
  year?: string | null;
  genre?: string | null;
  thumbnail_url?: string | null;
  duration_seconds: number;
  duration_formatted: string;
  order_index: number;
}

export interface PlaylistSet {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  track_count: number;
}

export interface PlaylistSetDetails extends PlaylistSet {
  tracks: PlaylistSetItem[];
}

export interface ResolvePlaylistResponse {
  success: boolean;
  title: string;
  count: number;
  tracks: TrackItem[];
}

export interface CachedTrackItem extends TrackItem {
  artist?: string;
  file_path?: string | null;
  file_size_bytes?: number;
  file_size_mb?: number;
  play_count: number;
  last_played_at?: number | null;
  last_played_relative?: string;
  is_cached: boolean;
  rotation_status?: "heavy" | "medium" | "light";
  rank?: number | null;
}

export interface DJArtistStat {
  artist: string;
  play_count: number;
  track_count: number;
}

export interface DJTopChartResponse {
  success: boolean;
  total_tracks: number;
  total_plays: number;
  chart: CachedTrackItem[];
}

export interface DJSmartRecommendationsResponse {
  success: boolean;
  top_artists: DJArtistStat[];
  rotation_ready: CachedTrackItem[];
  affinity_recommendations: TrackItem[];
}

export interface UpdateAsset {
  name: string;
  size: number;
  download_url: string;
  content_type?: string;
}

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  tag_name?: string;
  update_available: boolean;
  release_name: string;
  release_notes: string;
  published_at: string;
  html_url: string;
  asset: UpdateAsset | null;
  error?: string;
}

export type UpdateDownloadState = "idle" | "downloading" | "downloaded" | "error";

export interface UpdateDownloadStatus {
  status: UpdateDownloadState;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  speed_mbps: number;
  file_path: string | null;
  file_name: string | null;
  error: string | null;
}


