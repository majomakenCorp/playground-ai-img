import { NextResponse } from "next/server";
import { CreateBrandBriefSchema } from "@/lib/validation/schemas";
import { createBrief, listBriefs } from "@/lib/storage/briefs";

export async function GET() {
  try {
    const items = await listBriefs(50);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[briefs] list failed", err);
    return NextResponse.json({ error: "briefs_failed" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateBrandBriefSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.formData.audience.ageMin > parsed.data.formData.audience.ageMax) {
    return NextResponse.json(
      { error: "invalid_request", issues: [{ message: "ageMin must be <= ageMax" }] },
      { status: 400 },
    );
  }

  try {
    const row = await createBrief(parsed.data.formData);
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (err) {
    console.error("[briefs] create failed", err);
    return NextResponse.json({ error: "briefs_failed" }, { status: 503 });
  }
}
