import Link from "next/link";
import { listBriefs } from "@/lib/storage/briefs";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default async function DemoHistoryPage() {
  const items = await listBriefs(100);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Saved demos</h1>
        <Link
          href="/demo"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          New demo →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No demos yet. Start one at <Link href="/demo" className="underline">/demo</Link>.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                href={`/demo/history/${b.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent/50"
              >
                <div>
                  <div className="text-sm font-medium">{b.brandName}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(b.createdAt)} ·{" "}
                    {b.generations.length === 0
                      ? "No generations"
                      : `${b.generations.length} generation${b.generations.length === 1 ? "" : "s"}`}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
