"use client";

import Link from "next/link";

export interface HistoryEntry {
  id: string;
  createdAt: string;
  providerId: string;
  prompt: string;
  imageUrl: string;
}

export function HistoryItem({ item }: { item: HistoryEntry }) {
  return (
    <li className="border-b border-sidebar-border last:border-b-0">
      <Link
        href={`/history/${item.id}`}
        className="flex gap-3 px-4 py-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-sm border border-sidebar-border object-cover"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm">{item.prompt}</span>
          <span className="text-xs text-muted-foreground">
            {item.providerId}
          </span>
        </div>
      </Link>
    </li>
  );
}
