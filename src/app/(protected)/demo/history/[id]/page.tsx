import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrief } from "@/lib/storage/briefs";
import { getSystemPrompt } from "@/lib/storage/system-prompts";
import { UuidV7Schema } from "@/lib/validation/schemas";
import { BriefView } from "@/components/demo/BriefView";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idParsed = UuidV7Schema.safeParse(id);
  if (!idParsed.success) notFound();

  const brief = await getBrief(idParsed.data);
  if (!brief) notFound();

  const promptIds = Array.from(new Set(brief.generations.map((g) => g.systemPromptId)));
  const prompts = await Promise.all(promptIds.map((pid) => getSystemPrompt(pid)));
  const promptMap = new Map(
    prompts.filter((p) => p !== null).map((p) => [p!.id, p!]),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <div>
        <Link
          href="/demo/history"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All demos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{brief.brandName}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Created {formatDate(brief.createdAt)} · ID <code>{brief.id}</code>
        </p>
      </div>

      <BriefView formData={brief.formData} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Generations ({brief.generations.length})
        </h2>
        {brief.generations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No generations yet.</p>
        ) : (
          <ul className="space-y-4">
            {brief.generations
              .slice()
              .reverse()
              .map((g, i) => {
                const sp = promptMap.get(g.systemPromptId);
                return (
                  <li
                    key={`${g.createdAt}-${i}`}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {sp ? (
                          <>
                            <span className="font-medium text-foreground">{sp.title}</span>{" "}
                            <span>({sp.name})</span>
                          </>
                        ) : (
                          <span className="italic">System prompt deleted</span>
                        )}
                      </span>
                      <span>{formatDate(g.createdAt)}</span>
                    </div>
                    <pre className="max-h-[50vh] overflow-auto rounded-md bg-muted/30 p-4 text-sm whitespace-pre-wrap">
                      {g.output}
                    </pre>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
