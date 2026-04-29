import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers/registry";
import { ProviderError, httpStatusFor } from "@/lib/providers/errors";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await ctx.params;
  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }
  if (!provider.fetchBalance) {
    return NextResponse.json(
      { error: "balance_not_supported" },
      { status: 404 },
    );
  }

  try {
    const balance = await provider.fetchBalance();
    return NextResponse.json({
      providerId: provider.id,
      credits: balance.credits,
      raw: balance.raw,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error(
        "[balance]",
        provider.id,
        "error",
        err.kind,
        err.message,
      );
      return NextResponse.json(
        { error: `provider_${err.kind}` },
        { status: httpStatusFor(err.kind) },
      );
    }
    console.error("[balance] unexpected error", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
