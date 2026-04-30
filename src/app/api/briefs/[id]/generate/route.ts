import { NextResponse } from "next/server";
import {
  GenerateBriefSchema,
  UuidV7Schema,
} from "@/lib/validation/schemas";
import { appendBriefGeneration, getBrief } from "@/lib/storage/briefs";
import { getSystemPrompt } from "@/lib/storage/system-prompts";
import { generateText } from "@/lib/providers/gemini-text";
import { ProviderError, httpStatusFor } from "@/lib/providers/errors";

export async function POST(
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

  const parsed = GenerateBriefSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const brief = await getBrief(idParsed.data);
  if (!brief) {
    return NextResponse.json({ error: "brief_not_found" }, { status: 404 });
  }
  const sp = await getSystemPrompt(parsed.data.systemPromptId);
  if (!sp) {
    return NextResponse.json({ error: "system_prompt_not_found" }, { status: 404 });
  }

  const userPrompt = [
    "Brand brief (JSON):",
    "```json",
    JSON.stringify(brief.formData, null, 2),
    "```",
  ].join("\n");

  let output: string;
  try {
    output = await generateText({
      systemPrompt: sp.content,
      userPrompt,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json(
        { error: err.kind, message: err.message },
        { status: httpStatusFor(err.kind) },
      );
    }
    console.error("[briefs] generate failed", err);
    return NextResponse.json({ error: "generate_failed" }, { status: 502 });
  }

  try {
    const updated = await appendBriefGeneration(idParsed.data, sp.id, output);
    return NextResponse.json({ item: updated });
  } catch (err) {
    console.error("[briefs] save generation failed", err);
    return NextResponse.json({ error: "briefs_failed" }, { status: 503 });
  }
}
