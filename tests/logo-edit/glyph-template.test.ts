import { describe, expect, it } from "vitest";
import {
  EDIT_INTENSITIES,
  EDIT_INTENSITY_LABELS,
  buildGlyphEditTemplate,
} from "@/lib/logo-edit/glyph-template";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("buildGlyphEditTemplate", () => {
  it("opens with <edit_mode> and closes with </edit_task>, glyph's block order", () => {
    const t = buildGlyphEditTemplate();
    expect(t.startsWith("<edit_mode>")).toBe(true);
    expect(t.trimEnd().endsWith("</edit_task>")).toBe(true);
    const order = [
      "<edit_mode>",
      "<role>",
      "<concept_direction>",
      "<brand_context>",
      "<visual_territory>",
      "<good_logo_principles>",
      "<bad_logo_anti_patterns>",
      "<negative_territory>",
      "<evaluation>",
      "<output_specification>",
      "<edit_task>",
    ];
    // Block openers only: <edit_mode> mentions <edit_task> in prose.
    const positions = order.map((tag) => t.indexOf(`${tag}\n`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("opens each fixed block exactly once (text mentions of a tag do not count)", () => {
    const t = buildGlyphEditTemplate();
    for (const tag of ["<output_specification>", "<edit_task>", "<edit_mode>", "<concept_direction>"]) {
      expect(count(t, `${tag}\n`)).toBe(1);
      expect(count(t, `</${tag.slice(1)}`)).toBe(1);
    }
  });

  it("embeds only the chosen intensity and the edit sibling line", () => {
    const t = buildGlyphEditTemplate("Refinamiento");
    expect(t).toContain('Concept "Refinamiento": Conservative refresh.');
    expect(t).not.toContain("Redraw the same symbol.");
    expect(t).not.toContain("Reinterpret the mark in the brand's aesthetic universe.");
    expect(t).toContain("only the degree of intervention on the existing mark changes.");
    expect(t).not.toContain("only the symbol idea changes.");
  });

  it("defaults to Reconstrucción and exports the three glyph labels in order", () => {
    expect(buildGlyphEditTemplate()).toContain('Concept "Reconstrucción"');
    expect(EDIT_INTENSITY_LABELS).toEqual(["Refinamiento", "Reconstrucción", "Reinterpretación"]);
    expect(EDIT_INTENSITIES.map((i) => i.label)).toEqual([...EDIT_INTENSITY_LABELS]);
  });

  it("keeps glyph's placeholders for the brand-specific blocks", () => {
    const t = buildGlyphEditTemplate();
    expect(t).toContain("<brand_name>[BRAND NAME]</brand_name>");
    expect(t).toContain("Contrast anchor: the wordmark reads first");
    expect(t).toContain("This brand is NOT:");
  });
});
