"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function VectorizeButton({
  id,
  alreadyVectorized,
}: {
  id: string;
  alreadyVectorized: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/history/${id}/vectorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "mono" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `error_${res.status}`);
        return;
      }
      router.refresh();
    } catch {
      setError("network_error");
    } finally {
      setPending(false);
    }
  }

  if (alreadyVectorized) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-vector">
        <Spline className="size-3.5" aria-hidden /> vectorized
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
        className="w-full"
      >
        <Spline className="size-4" aria-hidden />
        {pending ? "Vectorizing…" : "Vectorize"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
