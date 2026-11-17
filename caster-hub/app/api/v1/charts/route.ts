import { NextResponse } from "next/server";
import { getChartsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "top50";
    const limit = parseInt(searchParams.get("limit") || "50", 10) || 50;

    const payload = await getChartsData(category, limit);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to generate charts";
    console.error("Charts aggregation error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
