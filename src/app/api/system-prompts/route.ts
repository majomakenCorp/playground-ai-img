import { NextResponse } from "next/server";
import { SystemPromptInputSchema } from "@/lib/validation/schemas";
import {
  createSystemPrompt,
  listSystemPrompts,
} from "@/lib/storage/system-prompts";

export async function GET() {
  try {
    const items = await listSystemPrompts();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[system-prompts] list failed", err);
    return NextResponse.json({ error: "system_prompts_failed" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = SystemPromptInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const item = await createSystemPrompt(parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    console.error("[system-prompts] create failed", err);
    return NextResponse.json({ error: "system_prompts_failed" }, { status: 503 });
  }
}
