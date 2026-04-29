"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HistoryItem, type HistoryEntry } from "@/components/sidebar/HistoryItem";

export function HistorySidebar() {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/history?limit=50")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: HistoryEntry[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onAppend(e: Event) {
      const detail = (e as CustomEvent<HistoryEntry>).detail;
      if (!detail) return;
      setItems((prev) => [detail, ...prev]);
    }
    window.addEventListener("history:append", onAppend);
    return () => window.removeEventListener("history:append", onAppend);
  }, []);

  return (
    <ScrollArea className="flex-1">
      <ul className="flex flex-col">
        {loading ? (
          <li className="px-4 py-3 text-xs text-muted-foreground">Loading…</li>
        ) : items.length === 0 ? (
          <li className="px-4 py-3 text-xs text-muted-foreground">
            No history yet.
          </li>
        ) : (
          items.map((item) => <HistoryItem key={item.id} item={item} />)
        )}
      </ul>
    </ScrollArea>
  );
}
