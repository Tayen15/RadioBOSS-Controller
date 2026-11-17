import { NextResponse } from "next/server";
import { getAnalyticsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getAnalyticsData();
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to query analytics";
    console.error("Analytics API error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
