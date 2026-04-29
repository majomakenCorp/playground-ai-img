import { NextResponse } from "next/server";
import { aggregateUsage } from "@/lib/storage/history";

export async function GET() {
  let totals;
  try {
    totals = await aggregateUsage();
  } catch (err) {
    console.error("[usage] aggregate failed", err);
    return NextResponse.json({ error: "usage_failed" }, { status: 503 });
  }
  return NextResponse.json({ totals });
}
