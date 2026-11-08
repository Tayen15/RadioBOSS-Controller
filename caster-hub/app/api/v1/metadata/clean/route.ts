import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// Standard regex heuristic fallback for YouTube Music metadata cleaning
function heuristicClean(title: string, artist?: string): { clean_title: string; clean_artist: string } {
  let cleaned = title
    .replace(/\s*[\(\[]\s*(official\s*(music\s*)?(video|audio|lyric|lyrics)?|remastered(\s*\d{4})?|video\s*clip|lirik(\s*video)?|audio)\s*[\)\]]/gi, "")
    .replace(/\s*-\s*official\s*(music\s*)?(video|audio)/gi, "")
    .replace(/\s*\|.*$/, "")
    .replace(/\s*ft\.?\s*/gi, " feat. ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // If title has "Artist - Song", separate them
  let detectedArtist = artist || "";
  if (cleaned.includes(" - ") && !detectedArtist) {
    const parts = cleaned.split(" - ");
    detectedArtist = parts[0].trim();
    cleaned = parts.slice(1).join(" - ").trim();
  }

  return {
    clean_title: cleaned,
    clean_artist: detectedArtist,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("video_id");
    const titleHint = searchParams.get("title") || "";
    const artistHint = searchParams.get("artist") || "";

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter 'video_id'" },
        { status: 400 }
      );
    }

    const db = await getDb();

    if (db) {
      const tracksCol = db.collection("tracks_catalog");
      const track = await tracksCol.findOne({ video_id: videoId });

      if (track && track.master_clean_title) {
        return NextResponse.json({
          success: true,
          video_id: videoId,
          clean_title: track.master_clean_title,
          clean_artist: track.master_clean_artist || track.artist || "",
          original_title: track.title,
          votes_count: (track.stations || []).length || track.total_plays || 1,
          is_crowd_cleaned: true,
          source: "casterhub_crowd",
        });
      }
    }

    // Heuristic Fallback
    const fallback = heuristicClean(titleHint || videoId, artistHint);
    return NextResponse.json({
      success: true,
      video_id: videoId,
      clean_title: fallback.clean_title,
      clean_artist: fallback.clean_artist,
      original_title: titleHint || videoId,
      votes_count: 0,
      is_crowd_cleaned: fallback.clean_title !== titleHint,
      source: "heuristic",
    });
  } catch (error: any) {
    console.error("Clean metadata GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query clean metadata" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const videoIds: string[] = Array.isArray(body.video_ids) ? body.video_ids : [];

    if (videoIds.length === 0) {
      return NextResponse.json({ success: true, results: {} });
    }

    const db = await getDb();
    const results: Record<string, any> = {};

    if (db) {
      const tracksCol = db.collection("tracks_catalog");
      const tracks = await tracksCol
        .find({ video_id: { $in: videoIds } })
        .toArray();

      for (const t of tracks) {
        if (t.master_clean_title) {
          results[t.video_id] = {
            clean_title: t.master_clean_title,
            clean_artist: t.master_clean_artist || t.artist || "",
            votes: (t.stations || []).length || 1,
            is_crowd_cleaned: true,
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      total_found: Object.keys(results).length,
      results,
    });
  } catch (error: any) {
    console.error("Clean metadata POST batch error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed batch query" },
      { status: 500 }
    );
  }
}
