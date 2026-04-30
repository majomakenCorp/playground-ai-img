import { NextResponse } from "next/server";
import {
  SystemPromptPatchSchema,
  UuidV7Schema,
} from "@/lib/validation/schemas";
import {
  deleteSystemPrompt,
  getSystemPrompt,
  updateSystemPrompt,
} from "@/lib/storage/system-prompts";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const idParsed = UuidV7Schema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  try {
    const item = await getSystemPrompt(idParsed.data);
    if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[system-prompts] get failed", err);
    return NextResponse.json({ error: "system_prompts_failed" }, { status: 503 });
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const idParsed = UuidV7Schema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = SystemPromptPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const item = await updateSystemPrompt(idParsed.data, parsed.data);
    if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[system-prompts] update failed", err);
    return NextResponse.json({ error: "system_prompts_failed" }, { status: 503 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const idParsed = UuidV7Schema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  try {
    const ok = await deleteSystemPrompt(idParsed.data);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[system-prompts] delete failed", err);
    return NextResponse.json({ error: "system_prompts_failed" }, { status: 503 });
  }
}
