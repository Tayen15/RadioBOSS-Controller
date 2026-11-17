import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ActionRequestSchema } from "@/lib/schemas/request";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = ActionRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid action payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { station_hash, request_id, action } = parsed.data;
    const db = await getDb();

    if (!db) {
      return NextResponse.json({
        success: true,
        mock_mode: true,
        message: `Request ${request_id} diubah menjadi status ${action} (Mock Mode).`,
      });
    }

    const requestsCol = db.collection("listener_requests");
    const query: Record<string, any> = { station_hash };

    try {
      query._id = new ObjectId(request_id);
    } catch {
      query.id = request_id;
    }

    const statusMap: Record<string, string> = {
      accept: "accepted",
      reject: "rejected",
      played: "played",
    };

    const newStatus = statusMap[action] || "accepted";
    await requestsCol.updateOne(query, {
      $set: {
        status: newStatus,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      request_id,
      new_status: newStatus,
      message: `Status request berhasil diperbarui: ${newStatus}`,
    });
  } catch (error: any) {
    console.error("Action request error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process request action" },
      { status: 500 }
    );
  }
}
