"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AESTHETICS,
  ARCHETYPES,
  CLICHES,
  DRIVERS,
  FEEL_SCALES,
  PALETTES,
  PROJECT_TYPES,
  SECTORS,
  TONES,
  TYPOGRAPHY,
} from "@/components/demo/constants";

type FormData = {
  basics: { brandName: string; sector: string; projectType: "new" | "redesign" | "extension" | "" };
  core: { purpose: string; promise: string };
  feel: Record<(typeof FEEL_SCALES)[number]["key"], number>;
  character: { primaryArchetype: string; secondaryArchetype: string | null };
  audience: { ageMin: number; ageMax: number; drivers: string[]; lifeMoment: string };
  voice: { tonePositive: string; toneNegative: string };
  visual: { aesthetics: string[]; palette: string; typography: string };
  exclusions: { cliches: string[]; admire: string[]; differentiate: string[] };
};

const INITIAL: FormData = {
  basics: { brandName: "", sector: "", projectType: "" },
  core: { purpose: "", promise: "" },
  feel: {
    seriousPlayful: 50,
    warmClinical: 50,
    traditionalAvantgarde: 50,
    understatedExpressive: 50,
    refinedRaw: 50,
  },
  character: { primaryArchetype: "", secondaryArchetype: null },
  audience: { ageMin: 25, ageMax: 45, drivers: [], lifeMoment: "" },
  voice: { tonePositive: "", toneNegative: "" },
  visual: { aesthetics: [], palette: "", typography: "" },
  exclusions: { cliches: [], admire: ["", "", ""], differentiate: ["", "", ""] },
};

const TOTAL_STEPS = 8;

export function BrandBriefWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  const stepValid = useMemo(() => isStepValid(step, data), [step, data]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        formData: {
          ...data,
          exclusions: {
            ...data.exclusions,
            admire: data.exclusions.admire.map((s) => s.trim()).filter(Boolean),
            differentiate: data.exclusions.differentiate.map((s) => s.trim()).filter(Boolean),
          },
        },
      };
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { item?: { id: string }; error?: string };
      if (!res.ok || !body.item) {
        setError(body.error ?? "Failed to save brief");
        return;
      }
      setSavedId(body.item.id);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Failed to save brief");
    } finally {
      setSubmitting(false);
    }
  }

  if (savedId) {
    return (
      <GenerateScreen
        briefId={savedId}
        onReset={() => {
          setSavedId(null);
          setData(INITIAL);
          setStep(1);
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{step}</span>
        <span>/</span>
        <span>{TOTAL_STEPS}</span>
        <div className="ml-2 h-px flex-1 bg-border">
          <div
            className="h-px bg-foreground transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {step === 1 && <Step1 data={data} update={update} />}
      {step === 2 && <Step2 data={data} update={update} />}
      {step === 3 && <Step3 data={data} update={update} />}
      {step === 4 && <Step4 data={data} update={update} />}
      {step === 5 && <Step5 data={data} update={update} />}
      {step === 6 && <Step6 data={data} update={update} />}
      {step === 7 && <Step7 data={data} update={update} />}
      {step === 8 && <Step8 data={data} update={update} />}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-10 flex items-center justify-between">
        {step > 1 ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setStep((s) => s - 1)}
          >
            ← Back
          </button>
        ) : (
          <span />
        )}
        {step < TOTAL_STEPS ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} disabled={!stepValid || submitting}>
            {submitting ? "Saving…" : "Finish"}
          </Button>
        )}
      </div>
    </div>
  );
}

function isStepValid(step: number, d: FormData): boolean {
  switch (step) {
    case 1:
      return d.basics.brandName.trim().length > 0 && !!d.basics.sector && !!d.basics.projectType;
    case 2:
      return (
        d.core.purpose.trim().length > 0 &&
        d.core.purpose.length <= 140 &&
        d.core.promise.trim().length > 0 &&
        d.core.promise.length <= 140
      );
    case 3:
      return true;
    case 4:
      return d.character.primaryArchetype.length > 0;
    case 5:
      return (
        d.audience.ageMin <= d.audience.ageMax &&
        d.audience.lifeMoment.trim().length > 0 &&
        d.audience.drivers.length > 0
      );
    case 6:
      return !!d.voice.tonePositive && !!d.voice.toneNegative;
    case 7:
      return d.visual.aesthetics.length > 0 && !!d.visual.palette && !!d.visual.typography;
    case 8:
      return true;
    default:
      return false;
  }
}

type StepProps = {
  data: FormData;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
};

function StepHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="mb-6 space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{intro}</p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background hover:border-foreground/50",
      )}
    >
      {children}
    </button>
  );
}

function Step1({ data, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeader title="The Basics" intro="Three details to get started." />

      <div className="space-y-2">
        <Label htmlFor="brandName">Brand name</Label>
        <Input
          id="brandName"
          value={data.basics.brandName}
          onChange={(e) => update("basics", { ...data.basics, brandName: e.target.value })}
          placeholder="E.g. Marfil · Casa Lima · Talud"
        />
        <p className="text-xs text-muted-foreground">Help me create a name → (coming soon)</p>
      </div>

      <div className="space-y-2">
        <Label>Sector</Label>
        <p className="text-xs text-muted-foreground">
          Pick the closest one. If your brand spans several, choose the dominant.
        </p>
        <div className="flex flex-wrap gap-2">
          {SECTORS.map((s) => (
            <Chip
              key={s}
              active={data.basics.sector === s}
              onClick={() => update("basics", { ...data.basics, sector: s })}
            >
              {s}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>What kind of project is this?</Label>
        <RadioGroup
          value={data.basics.projectType || undefined}
          onValueChange={(v) =>
            update("basics", { ...data.basics, projectType: v as FormData["basics"]["projectType"] })
          }
          className="gap-2"
        >
          {PROJECT_TYPES.map((p) => (
            <Label
              key={p.value}
              htmlFor={`pt-${p.value}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors",
                data.basics.projectType === p.value
                  ? "border-foreground bg-accent"
                  : "border-border hover:border-foreground/40",
              )}
            >
              <RadioGroupItem value={p.value} id={`pt-${p.value}`} className="mt-0.5" />
              <div>
                <div className="text-sm font-medium text-foreground">{p.title}</div>
                <div className="text-xs text-muted-foreground">{p.subtitle}</div>
              </div>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

function CharCounter({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <p className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
      {value.length} / {max}
    </p>
  );
}

function Step2({ data, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeader
        title="The Core"
        intro="Two short sentences. The first says why the brand exists. The second, what the person who chooses you gets."
      />

      <div className="space-y-2">
        <Label htmlFor="purpose">Purpose</Label>
        <Textarea
          id="purpose"
          rows={2}
          value={data.core.purpose}
          onChange={(e) => update("core", { ...data.core, purpose: e.target.value })}
          placeholder="We exist to…"
        />
        <div className="flex justify-between">
          <p className="text-xs text-muted-foreground">
            What drives the brand, not what it sells. Max 140 characters.
          </p>
          <CharCounter value={data.core.purpose} max={140} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="promise">Promise</Label>
        <Textarea
          id="promise"
          rows={2}
          value={data.core.promise}
          onChange={(e) => update("core", { ...data.core, promise: e.target.value })}
          placeholder="When someone chooses us, they get…"
        />
        <div className="flex justify-between">
          <p className="text-xs text-muted-foreground">
            The concrete value, in your customer&apos;s words. Max 140 characters.
          </p>
          <CharCounter value={data.core.promise} max={140} />
        </div>
      </div>
    </div>
  );
}

function Step3({ data, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeader
        title="How the Brand Feels"
        intro="Five scales. Slide each one to where you'd want the brand to land."
      />
      <div className="space-y-6">
        {FEEL_SCALES.map((s) => (
          <div key={s.key} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{s.left}</span>
              <span>{s.right}</span>
            </div>
            <Slider
              value={[data.feel[s.key]]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => update("feel", { ...data.feel, [s.key]: v })}
              aria-label={`${s.left} to ${s.right}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Step4({ data, update }: StepProps) {
  function pick(name: string) {
    const c = data.character;
    if (c.primaryArchetype === name) {
      update("character", { primaryArchetype: "", secondaryArchetype: null });
      return;
    }
    if (c.secondaryArchetype === name) {
      update("character", { ...c, secondaryArchetype: null });
      return;
    }
    if (!c.primaryArchetype) {
      update("character", { ...c, primaryArchetype: name });
      return;
    }
    update("character", { ...c, secondaryArchetype: name });
  }

  const status = !data.character.primaryArchetype
    ? "Pick your primary archetype"
    : !data.character.secondaryArchetype
      ? "Pick a secondary (optional)"
      : "All set";

  return (
    <div className="space-y-6">
      <StepHeader
        title="The Character Behind It"
        intro="Twelve classic archetypes. Pick the one that most resembles your brand, and a secondary one to add nuance."
      />
      <p className="text-xs text-muted-foreground">{status}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {ARCHETYPES.map((a) => {
          const isPrimary = data.character.primaryArchetype === a.name;
          const isSecondary = data.character.secondaryArchetype === a.name;
          return (
            <button
              key={a.name}
              type="button"
              onClick={() => pick(a.name)}
              className={cn(
                "group rounded-md border p-3 text-left transition-colors",
                isPrimary && "border-foreground bg-accent",
                isSecondary && "border-foreground border-dashed",
                !isPrimary && !isSecondary && "border-border hover:border-foreground/40",
              )}
            >
              <div className="text-sm font-medium">{a.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{a.examples}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step5({ data, update }: StepProps) {
  function toggleDriver(d: string) {
    const current = data.audience.drivers;
    update("audience", {
      ...data.audience,
      drivers: current.includes(d) ? current.filter((x) => x !== d) : [...current, d],
    });
  }

  return (
    <div className="space-y-6">
      <StepHeader title="Who You're Talking To" intro="Describe your audience." />

      <div className="space-y-2">
        <Label>Age range</Label>
        <p className="text-xs text-muted-foreground">
          The core, not the full spectrum. If it&apos;s broad, prioritize the segment that matters most.
        </p>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={16}
            max={99}
            value={data.audience.ageMin}
            onChange={(e) =>
              update("audience", { ...data.audience, ageMin: Number(e.target.value) || 0 })
            }
            className="w-24"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="number"
            min={16}
            max={99}
            value={data.audience.ageMax}
            onChange={(e) =>
              update("audience", { ...data.audience, ageMax: Number(e.target.value) || 0 })
            }
            className="w-24"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>What drives them</Label>
        <p className="text-xs text-muted-foreground">
          Pick the ones that apply. Three or four is usually enough.
        </p>
        <div className="flex flex-wrap gap-2">
          {DRIVERS.map((d) => (
            <Chip
              key={d}
              active={data.audience.drivers.includes(d)}
              onClick={() => toggleDriver(d)}
            >
              {d}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lifeMoment">Life moment</Label>
        <Input
          id="lifeMoment"
          value={data.audience.lifeMoment}
          onChange={(e) => update("audience", { ...data.audience, lifeMoment: e.target.value })}
          placeholder="E.g. Just moved · Starting their first business · Looking for a career change"
        />
        <p className="text-xs text-muted-foreground">One line. The most revealing one.</p>
      </div>
    </div>
  );
}

function Step6({ data, update }: StepProps) {
  function pick(name: string) {
    const v = data.voice;
    if (v.tonePositive === name) {
      update("voice", { ...v, tonePositive: "" });
      return;
    }
    if (v.toneNegative === name) {
      update("voice", { ...v, toneNegative: "" });
      return;
    }
    if (!v.tonePositive) {
      update("voice", { ...v, tonePositive: name });
      return;
    }
    update("voice", { ...v, toneNegative: name });
  }

  return (
    <div className="space-y-6">
      <StepHeader
        title="How It Sounds"
        intro="Ten possible tones. Pick the one that resonates most with your brand — and the one that clearly doesn't."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {TONES.map((t) => {
          const isYes = data.voice.tonePositive === t.name;
          const isNo = data.voice.toneNegative === t.name;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => pick(t.name)}
              className={cn(
                "rounded-md border p-3 text-left transition-colors",
                isYes && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
                isNo && "border-border bg-muted/50 opacity-60",
                !isYes && !isNo && "border-border hover:border-foreground/40",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {isYes && <span className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Yes</span>}
                {isNo && <span className="text-xs uppercase tracking-wide text-muted-foreground">No</span>}
                <span className={cn(isNo && "line-through")}>{t.name}</span>
              </div>
              <div className="mt-1 text-xs italic text-muted-foreground">{t.example}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step7({ data, update }: StepProps) {
  function toggleAesthetic(a: string) {
    const current = data.visual.aesthetics;
    if (current.includes(a)) {
      update("visual", { ...data.visual, aesthetics: current.filter((x) => x !== a) });
    } else if (current.length < 3) {
      update("visual", { ...data.visual, aesthetics: [...current, a] });
    }
  }

  return (
    <div className="space-y-8">
      <StepHeader
        title="How It Looks"
        intro="Now the visual part. Three blocks: aesthetic, palette, and typography."
      />

      <div className="space-y-3">
        <Label>Aesthetic universe</Label>
        <p className="text-xs text-muted-foreground">
          Up to three references. Selected: {data.visual.aesthetics.length} / 3
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {AESTHETICS.map((a) => {
            const active = data.visual.aesthetics.includes(a.name);
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => toggleAesthetic(a.name)}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  active ? "border-foreground bg-accent" : "border-border hover:border-foreground/40",
                )}
              >
                <div className="text-sm font-medium">{a.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{a.micro}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Palette</Label>
        <p className="text-xs text-muted-foreground">Eight curated ranges. Pick the one you like best.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PALETTES.map((p) => {
            const active = data.visual.palette === p.name;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => update("visual", { ...data.visual, palette: p.name })}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  active ? "border-foreground bg-accent" : "border-border hover:border-foreground/40",
                )}
              >
                <div className="flex gap-1">
                  {p.swatches.map((sw) => (
                    <span
                      key={sw}
                      className="h-6 w-6 rounded-full border border-border"
                      style={{ backgroundColor: sw }}
                    />
                  ))}
                </div>
                <div className="mt-2 text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.micro}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Typography</Label>
        <p className="text-xs text-muted-foreground">Proven pairings.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TYPOGRAPHY.map((t) => {
            const active = data.visual.typography === t.name;
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => update("visual", { ...data.visual, typography: t.name })}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  active ? "border-foreground bg-accent" : "border-border hover:border-foreground/40",
                )}
              >
                <div className="text-sm font-medium">{t.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.micro}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Step8({ data, update }: StepProps) {
  function toggleCliche(c: string) {
    const current = data.exclusions.cliches;
    update("exclusions", {
      ...data.exclusions,
      cliches: current.includes(c) ? current.filter((x) => x !== c) : [...current, c],
    });
  }

  function setBrandSlot(field: "admire" | "differentiate", index: number, value: string) {
    const current = [...data.exclusions[field]];
    current[index] = value;
    update("exclusions", { ...data.exclusions, [field]: current });
  }

  return (
    <div className="space-y-8">
      <StepHeader
        title="What You Don't Want"
        intro="As important as what you want. What you rule out sharpens the direction."
      />

      <div className="space-y-3">
        <Label>Clichés to avoid</Label>
        <p className="text-xs text-muted-foreground">Check the ones that feel off for your brand.</p>
        <div className="flex flex-wrap gap-2">
          {CLICHES.map((c) => (
            <Chip
              key={c}
              active={data.exclusions.cliches.includes(c)}
              onClick={() => toggleCliche(c)}
            >
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Brands you admire</Label>
        <p className="text-xs text-muted-foreground">Up to three. Not to copy — to locate the territory.</p>
        <div className="grid gap-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Input
              key={i}
              value={data.exclusions.admire[i] ?? ""}
              onChange={(e) => setBrandSlot("admire", i, e.target.value)}
              placeholder="E.g. Aesop"
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Brands you want to differentiate from</Label>
        <p className="text-xs text-muted-foreground">
          Up to three. What you don&apos;t want to look like helps just as much as what you do.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Input
              key={i}
              value={data.exclusions.differentiate[i] ?? ""}
              onChange={(e) => setBrandSlot("differentiate", i, e.target.value)}
              placeholder="E.g. competitor name"
            />
          ))}
        </div>
      </div>

      <Card className="bg-muted/30 p-4">
        <div className="text-xs text-muted-foreground">
          Click <span className="font-medium text-foreground">Finish</span> to save your brief. You&apos;ll
          be able to generate a brand manual in a follow-up step.
        </div>
      </Card>
    </div>
  );
}


type SystemPromptOption = { id: string; title: string; name: string };

function GenerateScreen({ briefId, onReset }: { briefId: string; onReset: () => void }) {
  const [prompts, setPrompts] = useState<SystemPromptOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system-prompts")
      .then((r) => r.json())
      .then((b: { items?: SystemPromptOption[] }) => setPrompts(b.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    if (!selected) return;
    setGenerating(true);
    setError(null);
    setOutput(null);
    try {
      const res = await fetch(`/api/briefs/${briefId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPromptId: selected }),
      });
      const body = (await res.json()) as {
        item?: { generations: Array<{ output: string }> };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Generation failed");
        return;
      }
      setOutput(body.item?.generations.at(-1)?.output ?? "");
    } catch (err) {
      console.error(err);
      setError("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
    } catch {}
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Brief saved</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ID: <code className="text-xs">{briefId}</code>
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div className="space-y-2">
          <Label>System prompt</Label>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading prompts…</p>
          ) : prompts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No system prompts yet. Create one at{" "}
              <a href="/system-prompts" className="underline">
                System Prompts
              </a>
              .
            </p>
          ) : (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a system prompt" />
              </SelectTrigger>
              <SelectContent>
                {prompts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}{" "}
                    <span className="text-muted-foreground">({p.name})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={generate} disabled={!selected || generating}>
            {generating ? "Generating…" : "Generate brief"}
          </Button>
          <Button variant="ghost" onClick={onReset}>
            New brief
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {output !== null && (
        <Card className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Output
            </h2>
            <Button size="sm" variant="ghost" onClick={copyOutput}>
              Copy
            </Button>
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/30 p-4 text-sm whitespace-pre-wrap">
            {output}
          </pre>
        </Card>
      )}
    </div>
  );
}
