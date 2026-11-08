import { z } from "zod";

export const AirplayEventSchema = z.object({
  video_id: z.string().min(3),
  title: z.string().min(1),
  artist: z.string().optional().default(""),
  clean_title: z.string().optional(),
  clean_artist: z.string().optional(),
  album: z.string().optional().default(""),
  genre: z.string().optional().default("Pop"),
  thumbnail_url: z.string().optional().default(""),
  duration_seconds: z.number().int().nonnegative().default(0),
  duration_formatted: z.string().default("00:00"),
  action_type: z.enum(["queue_next", "queue_bottom", "cache_download"]).default("queue_bottom"),
  time_belt: z.enum(["morning", "afternoon", "night"]).default("morning"),
  timestamp: z.number().positive(),
});

export const NowPlayingTrackSchema = z.object({
  video_id: z.string().optional().default(""),
  title: z.string().optional().default(""),
  artist: z.string().optional().default(""),
  duration: z.string().optional().default(""),
});

export const SyncPayloadSchema = z.object({
  station_hash: z.string().min(16),
  station_name: z.string().max(64).optional().default(""),
  app_version: z.string().default("1.0.0"),
  airtime_delta_seconds: z.number().int().nonnegative().default(0),
  cache_saved_bytes: z.number().int().nonnegative().default(0),
  now_playing: NowPlayingTrackSchema.optional(),
  events: z.array(AirplayEventSchema).default([]),
});

export type AirplayEvent = z.infer<typeof AirplayEventSchema>;
export type NowPlayingTrack = z.infer<typeof NowPlayingTrackSchema>;
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;
