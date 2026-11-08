import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { SyncPayloadSchema } from "@/lib/schemas/telemetry";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = SyncPayloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid payload format", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      station_hash,
      station_name,
      app_version,
      airtime_delta_seconds,
      cache_saved_bytes,
      now_playing,
      events,
    } = parsed.data;

    const now = new Date();
    const db = await getDb();

    // If MongoDB URI is not configured yet, return graceful mock acknowledgment
    if (!db) {
      return NextResponse.json({
        success: true,
        mock_mode: true,
        message: "Telemetry received (Database pending configuration).",
        processed_events: events.length,
      });
    }

    // 1. Update or Insert Station Pulse (Air-Time, Last Seen, Saved Bytes, Station Name, Now Playing)
    const stationsCol = db.collection("stations_pulse");
    const totalMusicSeconds = events.reduce((sum, e) => sum + e.duration_seconds, 0);

    const stationUpdateSet: Record<string, any> = {
      app_version,
      last_seen_at: now,
    };
    if (station_name && station_name.trim().length > 0) {
      stationUpdateSet.station_name = station_name.trim();
    }
    if (now_playing && now_playing.title) {
      stationUpdateSet.now_playing = now_playing;
    }

    await stationsCol.updateOne(
      { station_hash },
      {
        $inc: {
          total_airtime_seconds: airtime_delta_seconds,
          total_songs_played: events.length,
          total_music_duration_seconds: totalMusicSeconds,
          cache_saved_bytes: cache_saved_bytes,
        },
        $set: stationUpdateSet,
        $setOnInsert: {
          first_seen_at: now,
        },
      },
      { upsert: true }
    );

    // 2. Ingest Airplay Events with Daily Station Deduplication
    const eventsCol = db.collection("airplay_events");
    const tracksCol = db.collection("tracks_catalog");

    // Ensure Indexes are set (idempotent)
    await eventsCol.createIndex({ created_at: 1 }, { expireAfterSeconds: 2592000 }); // TTL 30 days
    await eventsCol
      .createIndex({ station_hash: 1, video_id: 1, date_bucket: 1 }, { unique: true })
      .catch(() => {});

    for (const evt of events) {
      const evtDate = new Date(evt.timestamp * 1000);
      const dateBucket = evtDate.toISOString().split("T")[0];

      // Upsert daily deduplication per station
      await eventsCol.updateOne(
        {
          station_hash,
          video_id: evt.video_id,
          date_bucket: dateBucket,
        },
        {
          $setOnInsert: {
            station_hash,
            video_id: evt.video_id,
            title: evt.title,
            artist: evt.artist,
            album: evt.album,
            genre: evt.genre,
            duration_seconds: evt.duration_seconds,
            action_type: evt.action_type,
            time_belt: evt.time_belt,
            date_bucket: dateBucket,
            created_at: evtDate,
          },
          $inc: { daily_plays: 1 },
        },
        { upsert: true }
      );

      // Handle Crowd-Cleaned Metadata Variant Tracking
      const cleanTitle = evt.clean_title?.trim() || evt.title.trim();
      const cleanArtist = evt.clean_artist?.trim() || evt.artist?.trim() || "";

      // Update Catalog Crowd-Cleaned Info & Global Score
      await tracksCol.updateOne(
        { video_id: evt.video_id },
        {
          $set: {
            title: evt.title,
            artist: evt.artist,
            album: evt.album,
            genre: evt.genre,
            thumbnail_url: evt.thumbnail_url,
            duration_seconds: evt.duration_seconds,
            duration_formatted: evt.duration_formatted,
            master_clean_title: cleanTitle,
            master_clean_artist: cleanArtist,
            last_played_at: evtDate,
          },
          $inc: { total_plays: 1 },
          $addToSet: { stations: station_hash },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Telemetry processed successfully.",
      processed_events: events.length,
      airtime_recorded: airtime_delta_seconds,
    });
  } catch (error: any) {
    console.error("Telemetry sync error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
