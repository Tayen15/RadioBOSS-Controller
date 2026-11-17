import { z } from "zod";

export const SubmitRequestSchema = z.object({
  station_hash: z.string().min(10),
  sender_name: z.string().min(2, "Nama minimal 2 karakter").max(50),
  message: z.string().max(250).optional().default(""),
  video_id: z.string().min(3),
  title: z.string().min(1),
  artist: z.string().optional().default(""),
  thumbnail_url: z.string().optional().default(""),
  duration_formatted: z.string().optional().default("00:00"),
});

export const ActionRequestSchema = z.object({
  station_hash: z.string().min(10),
  request_id: z.string().min(5),
  action: z.enum(["accept", "reject", "played"]),
});

export type SubmitRequestPayload = z.infer<typeof SubmitRequestSchema>;
export type ActionRequestPayload = z.infer<typeof ActionRequestSchema>;
