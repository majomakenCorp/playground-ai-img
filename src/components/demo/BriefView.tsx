import type { BrandBriefForm } from "@/lib/validation/schemas";
import { Card } from "@/components/ui/card";
import { FEEL_SCALES } from "@/components/demo/constants";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-[160px_1fr] md:gap-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Tags({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span
          key={s}
          className="rounded-full border border-border bg-background px-2 py-0.5 text-xs"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

export function BriefView({ formData }: { formData: BrandBriefForm }) {
  const f = formData;
  return (
    <div className="space-y-4">
      <Section title="Basics">
        <Row label="Brand name">{f.basics.brandName}</Row>
        <Row label="Sector">{f.basics.sector}</Row>
        <Row label="Project type">{f.basics.projectType}</Row>
      </Section>

      <Section title="Core">
        <Row label="Purpose">{f.core.purpose || "—"}</Row>
        <Row label="Promise">{f.core.promise || "—"}</Row>
      </Section>

      <Section title="Feel">
        {FEEL_SCALES.map((s) => (
          <Row key={s.key} label={`${s.left} ↔ ${s.right}`}>
            <div className="flex items-center gap-2">
              <div className="relative h-1.5 w-48 rounded-full bg-muted">
                <div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background"
                  style={{ left: `${f.feel[s.key]}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{f.feel[s.key]}</span>
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Character">
        <Row label="Primary">{f.character.primaryArchetype}</Row>
        <Row label="Secondary">{f.character.secondaryArchetype ?? "—"}</Row>
      </Section>

      <Section title="Audience">
        <Row label="Age range">
          {f.audience.ageMin} – {f.audience.ageMax}
        </Row>
        <Row label="Drivers">
          <Tags items={f.audience.drivers} />
        </Row>
        <Row label="Life moment">{f.audience.lifeMoment || "—"}</Row>
      </Section>

      <Section title="Voice">
        <Row label="Yes">{f.voice.tonePositive}</Row>
        <Row label="No">{f.voice.toneNegative}</Row>
      </Section>

      <Section title="Visual">
        <Row label="Aesthetics">
          <Tags items={f.visual.aesthetics} />
        </Row>
        <Row label="Palette">{f.visual.palette}</Row>
        <Row label="Typography">{f.visual.typography}</Row>
      </Section>

      <Section title="Exclusions">
        <Row label="Clichés">
          <Tags items={f.exclusions.cliches} />
        </Row>
        <Row label="Admire">
          <Tags items={f.exclusions.admire} />
        </Row>
        <Row label="Differentiate from">
          <Tags items={f.exclusions.differentiate} />
        </Row>
      </Section>
    </div>
  );
}
