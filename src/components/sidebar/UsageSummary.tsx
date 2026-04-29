"use client";

import { useEffect, useRef, useState } from "react";

interface UsageTotal {
  providerId: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  firstAt: string | null;
  lastAt: string | null;
}

interface BalanceState {
  credits: number;
  error: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  recraft: "Recraft",
  "gemini-nano-banana-2": "Gemini",
};

// Providers that expose a live account-balance endpoint.
const BALANCE_PROVIDERS = ["recraft"] as const;

export function UsageSummary() {
  const [totals, setTotals] = useState<UsageTotal[]>([]);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    Promise.all([
      fetch("/api/usage").then((r) =>
        r.ok ? r.json() : { totals: [] },
      ),
      ...BALANCE_PROVIDERS.map(async (id) => {
        const r = await fetch(`/api/providers/${id}/balance`);
        const body = (await r.json().catch(() => ({}))) as {
          credits?: number;
          error?: string;
        };
        return [id, r.ok ? body : { error: body.error ?? "fetch_failed" }] as const;
      }),
    ])
      .then(([usage, ...balanceEntries]) => {
        if (!aliveRef.current) return;
        setTotals((usage as { totals?: UsageTotal[] }).totals ?? []);
        const next: Record<string, BalanceState> = {};
        for (const [id, body] of balanceEntries as Array<
          readonly [string, { credits?: number; error?: string }]
        >) {
          next[id] = body.error
            ? { credits: 0, error: body.error }
            : { credits: body.credits ?? 0, error: null };
        }
        setBalances(next);
      })
      .catch(() => {
        // silent
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false);
      });
    return () => {
      aliveRef.current = false;
    };
  }, [refreshTick]);

  useEffect(() => {
    function onAppend() {
      setRefreshTick((n) => n + 1);
    }
    window.addEventListener("history:append", onAppend);
    return () => window.removeEventListener("history:append", onAppend);
  }, []);

  return (
    <div className="border-b border-sidebar-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Usage
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => setRefreshTick((n) => n + 1)}
          aria-label="Refresh usage"
        >
          ↻
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : totals.length === 0 && Object.keys(balances).length === 0 ? (
        <div className="text-xs text-muted-foreground">No spend yet.</div>
      ) : (
        <ul className="flex flex-col gap-3">
          {/* Show every provider that has a local total OR a live balance. */}
          {Array.from(
            new Set([
              ...totals.map((t) => t.providerId),
              ...Object.keys(balances),
            ]),
          ).map((providerId) => {
            const t = totals.find((x) => x.providerId === providerId);
            const b = balances[providerId];
            return (
              <li key={providerId} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-sm">
                  <span>{PROVIDER_LABELS[providerId] ?? providerId}</span>
                  <span className="font-mono tabular-nums">
                    {(t?.totalTokens ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t?.count ?? 0} runs (local)</span>
                  {t ? (
                    <span>
                      in {t.inputTokens.toLocaleString()} · out{" "}
                      {t.outputTokens.toLocaleString()}
                    </span>
                  ) : null}
                </div>
                {b ? (
                  b.error ? (
                    <div className="text-xs text-destructive">
                      Live balance: {b.error}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Live balance
                      </span>
                      <span className="font-mono tabular-nums">
                        {b.credits.toLocaleString()}
                      </span>
                    </div>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
