import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();

    if (db) {
      const eventsCol = db.collection("airplay_events");
      const stationsCol = db.collection("stations_pulse");
      const tracksCol = db.collection("tracks_catalog");

      // 1. Top genres
      const genreAgg = await tracksCol
        .aggregate([
          { $group: { _id: "$genre", count: { $sum: "$total_plays" } } },
          { $sort: { count: -1 } },
          { $limit: 6 },
        ])
        .toArray();

      const totalGenrePlays = genreAgg.reduce((sum, g) => sum + g.count, 0) || 1;
      const genreDistribution = genreAgg.map((g) => ({
        genre: g._id || "Pop",
        count: g.count,
        percentage: Math.round((g.count / totalGenrePlays) * 100),
      }));

      // 2. Top stations
      const topStations = await stationsCol
        .find({})
        .sort({ total_airtime_seconds: -1 })
        .limit(5)
        .toArray();

      const leaderBoard = topStations.map((st, idx) => ({
        rank: idx + 1,
        station_name: st.station_name || `Stasiun #${(st.station_hash || "").slice(0, 6).toUpperCase()}`,
        total_airtime_hours: Math.round((st.total_airtime_seconds || 0) / 3600),
        total_songs_played: st.total_songs_played || 0,
      }));

      return NextResponse.json({
        success: true,
        genre_distribution: genreDistribution,
        leaderboard: leaderBoard,
      });
    }

    // High quality zero-config demo analytics
    const fallbackHourly = [
      { hour: "00:00", weight: 15 },
      { hour: "02:00", weight: 8 },
      { hour: "04:00", weight: 12 },
      { hour: "06:00", weight: 58 },
      { hour: "08:00", weight: 92 }, // Morning Prime Peak
      { hour: "10:00", weight: 74 },
      { hour: "12:00", weight: 65 },
      { hour: "14:00", weight: 62 },
      { hour: "16:00", weight: 88 }, // Afternoon Drive Peak
      { hour: "18:00", weight: 70 },
      { hour: "20:00", weight: 82 }, // Night Session Peak
      { hour: "22:00", weight: 40 },
    ];

    const fallbackGenres = [
      { genre: "Pop Indonesia", percentage: 42, count: 4280 },
      { genre: "Indie / Folk", percentage: 24, count: 2450 },
      { genre: "International Pop", percentage: 16, count: 1630 },
      { genre: "Dangdut Koplo / Modern", percentage: 10, count: 1020 },
      { genre: "R&B / Soul", percentage: 5, count: 510 },
      { genre: "Rock / Alternatif", percentage: 3, count: 310 },
    ];

    const fallbackLeaderboard = [
      { rank: 1, station_name: "Radio Komunitas Ardan Live", total_airtime_hours: 145, total_songs_played: 2420 },
      { rank: 2, station_name: "Prambors Studio Jakarta", total_airtime_hours: 114, total_songs_played: 1890 },
      { rank: 3, station_name: "Stasiun #998877", total_airtime_hours: 80, total_songs_played: 1340 },
      { rank: 4, station_name: "FM Suara Edukasi Kampus", total_airtime_hours: 55, total_songs_played: 980 },
      { rank: 5, station_name: "Stasiun #554433", total_airtime_hours: 39, total_songs_played: 670 },
    ];

    return NextResponse.json({
      success: true,
      mock_mode: true,
      peak_hours: fallbackHourly,
      genre_distribution: fallbackGenres,
      leaderboard: fallbackLeaderboard,
      weekly_total_plays: 10200,
      active_airtime_hours: 433,
    });
  } catch (error: any) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query analytics" },
      { status: 500 }
    );
  }
}
