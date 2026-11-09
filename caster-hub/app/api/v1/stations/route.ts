import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

function formatAirtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}j ${m}m`;
}

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    if (db) {
      const stationsCol = db.collection("stations_pulse");
      const docs = await stationsCol
        .find({})
        .sort({ last_seen_at: -1 })
        .limit(100)
        .toArray();

      const stations = docs.map((doc, idx) => {
        const lastSeen = doc.last_seen_at ? new Date(doc.last_seen_at) : new Date(0);
        const isOnline = lastSeen >= tenMinutesAgo;
        const totalAirtimeSec = doc.total_airtime_seconds || 0;
        const cacheSavedBytes = doc.cache_saved_bytes || 0;

        const defaultAnonName = `Stasiun #${(doc.station_hash || "").slice(0, 6).toUpperCase() || (idx + 1).toString().padStart(4, "0")}`;

        return {
          station_hash: doc.station_hash,
          station_name: doc.station_name?.trim() || defaultAnonName,
          is_custom_name: Boolean(doc.station_name?.trim()),
          public_stream_url: doc.public_stream_url || "",
          enable_online_requests: doc.enable_online_requests !== false,
          app_version: doc.app_version || "1.0.0",
          total_airtime_seconds: totalAirtimeSec,
          total_airtime_formatted: formatAirtime(totalAirtimeSec),
          total_songs_played: doc.total_songs_played || 0,
          cache_saved_mb: Math.round(cacheSavedBytes / (1024 * 1024)),
          is_online: isOnline,
          last_seen_at: lastSeen.toISOString(),
          now_playing: doc.now_playing || null,
        };
      });

      return NextResponse.json({
        success: true,
        total_stations: stations.length,
        online_count: stations.filter((s) => s.is_online).length,
        stations,
      });
    }

    // Fallback Mock Data for Zero-Config Setup
    const mockStations = [
      {
        station_hash: "a1b2c3d4e5f60718",
        station_name: "Radio Komunitas Ardan Live",
        is_custom_name: true,
        public_stream_url: "https://stream.zeno.fm/f3wvbbqmdg8uv",
        enable_online_requests: true,
        app_version: "1.0.0",
        total_airtime_seconds: 524000,
        total_airtime_formatted: "145j 33m",
        total_songs_played: 2420,
        cache_saved_mb: 8400,
        is_online: true,
        last_seen_at: new Date().toISOString(),
        now_playing: {
          title: "Hati-Hati di Jalan",
          artist: "Tulus",
          duration: "04:02",
        },
      },
      {
        station_hash: "f8e7d6c5b4a39281",
        station_name: "Prambors Studio Jakarta",
        is_custom_name: true,
        public_stream_url: "https://stream.zeno.fm/f3wvbbqmdg8uv",
        enable_online_requests: true,
        app_version: "1.0.0",
        total_airtime_seconds: 412000,
        total_airtime_formatted: "114j 26m",
        total_songs_played: 1890,
        cache_saved_mb: 6100,
        is_online: true,
        last_seen_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        now_playing: {
          title: "Sialan",
          artist: "Juicy Luicy ft. Adrian Khalif",
          duration: "03:45",
        },
      },
      {
        station_hash: "9988776655443322",
        station_name: "Stasiun #998877",
        is_custom_name: false,
        app_version: "0.9.3",
        total_airtime_seconds: 289000,
        total_airtime_formatted: "80j 16m",
        total_songs_played: 1340,
        cache_saved_mb: 4500,
        is_online: true,
        last_seen_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        now_playing: {
          title: "Gala Bunga Matahari",
          artist: "Sal Priadi",
          duration: "03:51",
        },
      },
      {
        station_hash: "1122334455667788",
        station_name: "FM Suara Edukasi Kampus",
        is_custom_name: true,
        app_version: "1.0.0",
        total_airtime_seconds: 198000,
        total_airtime_formatted: "55j 00m",
        total_songs_played: 980,
        cache_saved_mb: 3200,
        is_online: false,
        last_seen_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        now_playing: null,
      },
      {
        station_hash: "554433221100aabb",
        station_name: "Stasiun #554433",
        is_custom_name: false,
        app_version: "1.0.0",
        total_airtime_seconds: 142000,
        total_airtime_formatted: "39j 26m",
        total_songs_played: 670,
        cache_saved_mb: 2100,
        is_online: false,
        last_seen_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        now_playing: null,
      },
    ];

    return NextResponse.json({
      success: true,
      mock_mode: true,
      total_stations: mockStations.length,
      online_count: mockStations.filter((s) => s.is_online).length,
      stations: mockStations,
    });
  } catch (error: any) {
    console.error("Stations API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query stations" },
      { status: 500 }
    );
  }
}
