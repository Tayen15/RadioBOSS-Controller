import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "top50"; // top50, trending, morning, afternoon, night
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const db = await getDb();

    // Mock data fallback if MongoDB URI is not set
    if (!db) {
      const mockTracks = [
        {
          rank: 1,
          video_id: "k1BfsO0mxWQ",
          title: "Dan...",
          artist: "Sheila On 7",
          album: "Sheila On 7",
          genre: "Pop",
          duration_formatted: "04:49",
          total_plays: 142,
          unique_stations: 28,
          movement: "NEW",
        },
        {
          rank: 2,
          video_id: "7q6B6J8lT3s",
          title: "Hati-Hati di Jalan",
          artist: "Tulus",
          album: "Manusia",
          genre: "Pop",
          duration_formatted: "04:02",
          total_plays: 128,
          unique_stations: 24,
          movement: "+2",
        },
        {
          rank: 3,
          video_id: "0a1b2c3d4e",
          title: "Sial",
          artist: "Mahalini",
          album: "FABULA",
          genre: "Pop",
          duration_formatted: "04:03",
          total_plays: 110,
          unique_stations: 19,
          movement: "-1",
        },
      ];

      return NextResponse.json(
        {
          success: true,
          category,
          total: mockTracks.length,
          tracks: mockTracks,
          source: "mock_fallback",
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        }
      );
    }

    const eventsCol = db.collection("airplay_events");
    const tracksCol = db.collection("tracks_catalog");

    let matchStage: any = {};
    const now = new Date();

    if (category === "trending") {
      // Last 48 hours
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 3600 * 1000);
      matchStage = { created_at: { $gte: fortyEightHoursAgo } };
    } else if (["morning", "afternoon", "night"].includes(category)) {
      matchStage = { time_belt: category };
    } else {
      // Weekly top (Last 7 days)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      matchStage = { created_at: { $gte: sevenDaysAgo } };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$video_id",
          total_plays: { $sum: 1 },
          stations: { $addToSet: "$station_hash" },
          title: { $first: "$title" },
          artist: { $first: "$artist" },
          album: { $first: "$album" },
          genre: { $first: "$genre" },
          duration_seconds: { $first: "$duration_seconds" },
        },
      },
      {
        $project: {
          video_id: "$_id",
          title: 1,
          artist: 1,
          album: 1,
          genre: 1,
          duration_seconds: 1,
          total_plays: 1,
          unique_stations: { $size: "$stations" },
        },
      },
      { $sort: { total_plays: -1, unique_stations: -1 } },
      { $limit: limit },
    ];

    const results = await eventsCol.aggregate(pipeline).toArray();

    // Map ranks & duration formatting
    const formattedTracks = results.map((t, idx) => {
      const durSec = t.duration_seconds || 0;
      const m = Math.floor(durSec / 60);
      const s = durSec % 60;
      return {
        rank: idx + 1,
        video_id: t.video_id,
        title: t.title || "Unknown Title",
        artist: t.artist || "Unknown Artist",
        album: t.album || "Single",
        genre: t.genre || "Pop",
        duration_formatted: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
        total_plays: t.total_plays,
        unique_stations: t.unique_stations,
        movement: idx === 0 ? "STABLE" : "+1",
      };
    });

    return NextResponse.json(
      {
        success: true,
        category,
        total: formattedTracks.length,
        tracks: formattedTracks,
        source: "live_database",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    console.error("Charts aggregation error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate charts" },
      { status: 500 }
    );
  }
}
