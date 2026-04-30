"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/auth/LogoutButton";

const LINKS = [
  { href: "/", label: "History", match: (p: string) => p === "/" },
  {
    href: "/demo",
    label: "Demo",
    match: (p: string) => p === "/demo",
  },
  {
    href: "/demo/history",
    label: "Saved demos",
    match: (p: string) => p.startsWith("/demo/history"),
  },
  {
    href: "/system-prompts",
    label: "System Prompts",
    match: (p: string) => p.startsWith("/system-prompts"),
  },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <nav className="flex items-center gap-1">
        {LINKS.map((l) => {
          const active = l.match(pathname);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <LogoutButton />
    </header>
  );
}
