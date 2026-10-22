/**
 * Type definitions for Radio Caster Request Bridge Frontend.
 */

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
  enable_loudnorm?: boolean;
  custom_cache_dir?: string;
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
  total_files: number;
  total_size_bytes: number;
  total_size_mb: number;
}

export interface TalkingPoints {
  intro_talk_window: string;
  outro_talk_window: string;
  broadcaster_tips: string[];
}

export interface LyricsResponse {
  video_id: string;
  has_lyrics: boolean;
  lyrics: string;
  source: string;
  talking_points: TalkingPoints;
}

