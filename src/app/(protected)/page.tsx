import { listProviders } from "@/lib/providers/registry";
import { Playground } from "@/components/playground/Playground";

export const dynamic = "force-dynamic";

export default function PlaygroundPage() {
  const providers = listProviders();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Playground providers={providers} />
    </div>
  );
}
