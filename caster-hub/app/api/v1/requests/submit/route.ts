import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { SubmitRequestSchema } from "@/lib/schemas/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = SubmitRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Format request tidak valid", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      station_hash,
      sender_name,
      message,
      video_id,
      title,
      artist,
      thumbnail_url,
      duration_formatted,
    } = parsed.data;

    const now = new Date();
    const db = await getDb();

    if (!db) {
      // In-memory / Mock Mode
      return NextResponse.json({
        success: true,
        mock_mode: true,
        request_id: `req_mock_${Date.now()}`,
        message: "Request lagu berhasil dikirim ke bilik siar penyiar!",
      });
    }

    const requestsCol = db.collection("listener_requests");

    // Ensure index on station_hash & status
    await requestsCol.createIndex({ station_hash: 1, status: 1 });
    await requestsCol.createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 * 3 }); // 3 days TTL

    const doc = {
      station_hash,
      sender_name: sender_name.trim(),
      message: message?.trim() || "",
      video_id,
      title: title.trim(),
      artist: artist?.trim() || "",
      thumbnail_url: thumbnail_url || "",
      duration_formatted: duration_formatted || "00:00",
      status: "pending",
      created_at: now,
    };

    const result = await requestsCol.insertOne(doc);

    return NextResponse.json({
      success: true,
      request_id: result.insertedId.toString(),
      message: "Request lagu berhasil dikirim ke bilik siar penyiar!",
    });
  } catch (error: any) {
    console.error("Submit request error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Gagal mengirim request lagu" },
      { status: 500 }
    );
  }
}
