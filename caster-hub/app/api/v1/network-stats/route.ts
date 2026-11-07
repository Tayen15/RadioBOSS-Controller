import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const revalidate = 60; // 1 minute cache

export async function GET() {
  try {
    const db = await getDb();

    if (!db) {
      return NextResponse.json({
        success: true,
        mock_mode: true,
        stats: {
          total_airtime_hours: 1420.5,
          total_songs_dispatched: 18450,
          total_music_hours: 1140.2,
          total_cache_saved_gb: 92.4,
          active_stations_online: 12,
        },
        live_ticker: [
          { title: "Dan...", artist: "Sheila On 7", time_ago: "2m lalu" },
          { title: "Hati-Hati di Jalan", artist: "Tulus", time_ago: "5m lalu" },
          { title: "Sial", artist: "Mahalini", time_ago: "9m lalu" },
        ],
      });
    }

    const stationsCol = db.collection("stations_pulse");
    const eventsCol = db.collection("airplay_events");

    // 1. Calculate active stations online in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const activeStationsCount = await stationsCol.countDocuments({
      last_seen_at: { $gte: tenMinutesAgo },
    });

    // 2. Aggregate network totals
    const totalsAgg = await stationsCol
      .aggregate([
        {
          $group: {
            _id: null,
            total_airtime_seconds: { $sum: "$total_airtime_seconds" },
            total_songs_played: { $sum: "$total_songs_played" },
            total_music_duration_seconds: { $sum: "$total_music_duration_seconds" },
            total_cache_saved_bytes: { $sum: "$cache_saved_bytes" },
          },
        },
      ])
      .toArray();

    const totals = totalsAgg[0] || {
      total_airtime_seconds: 0,
      total_songs_played: 0,
      total_music_duration_seconds: 0,
      total_cache_saved_bytes: 0,
    };

    // 3. Recent live ticker (Last 10 events)
    const recentEvents = await eventsCol
      .find({})
      .sort({ created_at: -1 })
      .limit(8)
      .toArray();

    const now = Date.now();
    const liveTicker = recentEvents.map((e) => {
      const diffMin = Math.max(1, Math.floor((now - new Date(e.created_at).getTime()) / 60000));
      return {
        title: e.title || "Unknown Title",
        artist: e.artist || "Unknown Artist",
        time_ago: `${diffMin}m lalu`,
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        total_airtime_hours: +(totals.total_airtime_seconds / 3600).toFixed(1),
        total_songs_dispatched: totals.total_songs_played,
        total_music_hours: +(totals.total_music_duration_seconds / 3600).toFixed(1),
        total_cache_saved_gb: +(totals.total_cache_saved_bytes / (1024 * 1024 * 1024)).toFixed(1),
        active_stations_online: Math.max(1, activeStationsCount),
      },
      live_ticker: liveTicker,
    });
  } catch (error: any) {
    console.error("Network stats error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query network stats" },
      { status: 500 }
    );
  }
}
