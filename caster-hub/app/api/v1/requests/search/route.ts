import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    const db = await getDb();
    if (db && query.length >= 2) {
      const tracksCol = db.collection("tracks_catalog");
      const matched = await tracksCol
        .find({
          $or: [
            { title: { $regex: query, $options: "i" } },
            { artist: { $regex: query, $options: "i" } },
            { master_clean_title: { $regex: query, $options: "i" } },
          ],
        })
        .limit(10)
        .toArray();

      if (matched.length > 0) {
        return NextResponse.json({
          success: true,
          songs: matched.map((m) => ({
            video_id: m.video_id,
            title: m.master_clean_title || m.title,
            artist: m.master_clean_artist || m.artist || "",
            thumbnail_url: m.thumbnail_url || "",
            duration_formatted: m.duration_formatted || "03:30",
          })),
        });
      }
    }

    // Curated Indonesian & International studio tracks catalogue fallback
    const popularSongs = [
      { video_id: "dQw4w9WgXcQ", title: "Sialan", artist: "Juicy Luicy ft. Adrian Khalif", duration_formatted: "03:45", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
      { video_id: "kJQP7kiw5Fk", title: "Gala Bunga Matahari", artist: "Sal Priadi", duration_formatted: "03:51", thumbnail_url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg" },
      { video_id: "fJ9rUzIMcZQ", title: "Hati-Hati di Jalan", artist: "Tulus", duration_formatted: "04:02", thumbnail_url: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg" },
      { video_id: "mAKsZ26SabQ", title: "Untungnya, Hidup Harus Tetap Berjalan", artist: "Bernadya", duration_formatted: "03:40", thumbnail_url: "https://i.ytimg.com/vi/mAKsZ26SabQ/mqdefault.jpg" },
      { video_id: "kXYiU_JCYtU", title: "Komang", artist: "Raim Laode", duration_formatted: "03:42", thumbnail_url: "https://i.ytimg.com/vi/kXYiU_JCYtU/mqdefault.jpg" },
      { video_id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran", duration_formatted: "03:53", thumbnail_url: "https://i.ytimg.com/vi/JGwWNGJdvx8/mqdefault.jpg" },
      { video_id: "OPf0YbXqDm0", title: "Uptown Funk", artist: "Mark Ronson ft. Bruno Mars", duration_formatted: "04:30", thumbnail_url: "https://i.ytimg.com/vi/OPf0YbXqDm0/mqdefault.jpg" },
      { video_id: "7wtfhZwyrcc", title: "Nanti Kita Seperti Ini", artist: "Batas Senja", duration_formatted: "03:55", thumbnail_url: "https://i.ytimg.com/vi/7wtfhZwyrcc/mqdefault.jpg" },
      { video_id: "LjhCEgFreTW", title: "Bawalah Cintaku", artist: "Afgan", duration_formatted: "03:50", thumbnail_url: "https://i.ytimg.com/vi/LjhCEgFreTW/mqdefault.jpg" },
      { video_id: "9bZkp7q19f0", title: "Kisinan 2", artist: "Masdddho", duration_formatted: "04:10", thumbnail_url: "https://i.ytimg.com/vi/9bZkp7q19f0/mqdefault.jpg" },
    ];

    const filtered = query
      ? popularSongs.filter(
          (s) =>
            s.title.toLowerCase().includes(query) ||
            s.artist.toLowerCase().includes(query)
        )
      : popularSongs;

    return NextResponse.json({
      success: true,
      songs: filtered,
    });
  } catch (error: any) {
    console.error("Search songs error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed search" },
      { status: 500 }
    );
  }
}
