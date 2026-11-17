import { NextResponse } from "next/server";
import { getNetworkStatsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getNetworkStatsData();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to query network stats";
    console.error("Network stats error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
