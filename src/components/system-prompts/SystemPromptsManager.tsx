"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  name: string;
  content: string;
  updatedAt: string;
};

export function SystemPromptsManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [draft, setDraft] = useState({ title: "", name: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/system-prompts");
      const body = (await res.json()) as { items?: Item[] };
      setItems(body.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startNew() {
    setEditing(null);
    setDraft({ title: "", name: "", content: "" });
    setError(null);
  }

  function startEdit(item: Item) {
    setEditing(item);
    setDraft({ title: item.title, name: item.name, content: item.content });
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url = editing ? `/api/system-prompts/${editing.id}` : "/api/system-prompts";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await res.json()) as { item?: Item; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      await load();
      if (body.item) startEdit(body.item);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this system prompt?")) return;
    const res = await fetch(`/api/system-prompts/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editing?.id === id) startNew();
      await load();
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Prompts
          </h2>
          <Button size="sm" onClick={startNew}>
            New
          </Button>
        </div>
        <div className="space-y-1">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="text-xs text-muted-foreground">No prompts yet.</p>
          )}
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => startEdit(it)}
              className={cn(
                "block w-full rounded-md border p-3 text-left transition-colors",
                editing?.id === it.id
                  ? "border-foreground bg-accent"
                  : "border-border hover:border-foreground/40",
              )}
            >
              <div className="text-sm font-medium">{it.title}</div>
              <div className="text-xs text-muted-foreground">{it.name}</div>
            </button>
          ))}
        </div>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">
              {editing ? "Edit prompt" : "New prompt"}
            </h1>
            {editing && (
              <Button variant="ghost" size="sm" onClick={() => remove(editing.id)}>
                Delete
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-title">Title</Label>
            <Input
              id="sp-title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Brand Manual Generator"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-name">Name (short identifier)</Label>
            <Input
              id="sp-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="brand-manual-v1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-content">Content</Label>
            <Textarea
              id="sp-content"
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              rows={16}
              placeholder="You are a brand strategist. Given the following brief…"
              className="font-mono text-xs"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || !draft.title || !draft.name || !draft.content}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={startNew}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
