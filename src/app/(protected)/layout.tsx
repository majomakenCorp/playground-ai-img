import { HistorySidebar } from "@/components/sidebar/HistorySidebar";
import { UsageSummary } from "@/components/sidebar/UsageSummary";
import { TopNav } from "@/components/layout/TopNav";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <span className="font-semibold">History</span>
        </div>
        <UsageSummary />
        <HistorySidebar />
      </aside>
      <main className="flex flex-1 flex-col">
        <TopNav />
        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
}
