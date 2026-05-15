import { NextResponse } from "next/server";
import { PromptLabHistoryQuerySchema } from "@/lib/validation/schemas";
import { listTextHistory } from "@/lib/storage/text-history";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = PromptLabHistoryQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const items = await listTextHistory({
    limit: parsed.data.limit,
    before: parsed.data.before ? new Date(parsed.data.before) : undefined,
  });

  return NextResponse.json({ items });
}
