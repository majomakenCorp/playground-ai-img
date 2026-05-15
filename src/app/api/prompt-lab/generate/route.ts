import { NextResponse } from "next/server";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { PromptLabGenerateSchema } from "@/lib/validation/schemas";
import { generateText as geminiGenerateText } from "@/lib/providers/gemini-text";
import { generateText as claudeGenerateText } from "@/lib/providers/claude-cli";
import { createTextHistoryEntry } from "@/lib/storage/text-history";
import { ProviderError, httpStatusFor } from "@/lib/providers/errors";

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = PromptLabGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { providerId, prompt } = parsed.data;
  const started = Date.now();

  try {
    let output: string;
    let durationMs: number;

    if (providerId === "claude-cli") {
      const res = await claudeGenerateText({ userPrompt: prompt });
      output = res.output;
      durationMs = res.durationMs;
    } else {
      output = await geminiGenerateText({ userPrompt: prompt });
      durationMs = Date.now() - started;
    }

    const entry = await createTextHistoryEntry({
      providerId,
      prompt,
      output,
      durationMs,
    });

    return NextResponse.json({ item: entry });
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error(`[prompt-lab] provider error (${err.kind}):`, err.message);
      return NextResponse.json(
        { error: err.kind },
        { status: httpStatusFor(err.kind) },
      );
    }
    console.error("[prompt-lab] generate failed", err);
    return NextResponse.json({ error: "generate_failed" }, { status: 502 });
  }
}
