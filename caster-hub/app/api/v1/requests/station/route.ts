import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stationHash = searchParams.get("station_hash");
    const status = searchParams.get("status") || "pending";

    if (!stationHash) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter 'station_hash'" },
        { status: 400 }
      );
    }

    const db = await getDb();

    if (db) {
      const requestsCol = db.collection("listener_requests");
      const query: Record<string, any> = { station_hash: stationHash };
      if (status !== "all") {
        query.status = status;
      }

      const docs = await requestsCol
        .find(query)
        .sort({ created_at: -1 })
        .limit(50)
        .toArray();

      const requests = docs.map((d) => ({
        id: d._id.toString(),
        sender_name: d.sender_name,
        message: d.message || "",
        video_id: d.video_id,
        title: d.title,
        artist: d.artist || "",
        thumbnail_url: d.thumbnail_url || "",
        duration_formatted: d.duration_formatted || "00:00",
        status: d.status,
        created_at: d.created_at ? new Date(d.created_at).toISOString() : new Date().toISOString(),
      }));

      return NextResponse.json({
        success: true,
        station_hash: stationHash,
        total: requests.length,
        requests,
      });
    }

    // High quality demo fallback requests for zero-config testing
    const demoRequests = [
      {
        id: "req_demo_01",
        sender_name: "Dina di Dago",
        message: "Halo kak penyiar, salam buat temen-temen yang lagi nugas bareng di kampus! Puterin lagu ini yaa 🙏",
        video_id: "dQw4w9WgXcQ",
        title: "Sialan",
        artist: "Juicy Luicy ft. Adrian Khalif",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        duration_formatted: "03:45",
        status: "pending",
        created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      },
      {
        id: "req_demo_02",
        sender_name: "Rian (Driver Ojol)",
        message: "Semangat buat pejuang jalanan sore ini! Lagunya enak buat nemenin macet.",
        video_id: "kJQP7kiw5Fk",
        title: "Gala Bunga Matahari",
        artist: "Sal Priadi",
        thumbnail_url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg",
        duration_formatted: "03:51",
        status: "pending",
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
      {
        id: "req_demo_03",
        sender_name: "Ahmad & Tim Studio 4",
        message: "Req lagu Tulus dong min buat nyemangatin shift siang!",
        video_id: "fJ9rUzIMcZQ",
        title: "Hati-Hati di Jalan",
        artist: "Tulus",
        thumbnail_url: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg",
        duration_formatted: "04:02",
        status: "pending",
        created_at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      },
    ];

    return NextResponse.json({
      success: true,
      mock_mode: true,
      station_hash: stationHash,
      total: demoRequests.length,
      requests: demoRequests,
    });
  } catch (error: any) {
    console.error("Get station requests error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query station requests" },
      { status: 500 }
    );
  }
}
