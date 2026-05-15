import { listTextHistory } from "@/lib/storage/text-history";
import { env } from "@/lib/env";
import { PromptLab } from "@/components/prompt-lab/PromptLab";

export const dynamic = "force-dynamic";

export default async function PromptLabPage() {
  const history = await listTextHistory({ limit: 50 });

  const providers = [
    {
      id: "gemini-text" as const,
      label: "Gemini",
      description: "Gemini 3.1 Flash · API key",
      available: true,
    },
    {
      id: "claude-cli" as const,
      label: "Claude",
      description: "Host Claude Code CLI · subscription",
      available: env.CLAUDE_REFINE_ENABLED,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <PromptLab providers={providers} initialHistory={history} />
    </div>
  );
}
