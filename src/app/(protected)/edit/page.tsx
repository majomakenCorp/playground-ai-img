import { LogoEditor } from "@/components/edit/LogoEditor";

export const dynamic = "force-dynamic";

export default function EditPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <LogoEditor />
    </div>
  );
}
