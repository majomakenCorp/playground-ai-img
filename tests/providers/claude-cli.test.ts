import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MOCK = path.resolve(__dirname, "../fixtures/claude-mock.sh");

beforeEach(() => {
  vi.resetModules();
  process.env.CLAUDE_CLI_PATH = MOCK;
  process.env.CLAUDE_REFINE_ENABLED = "true";
  delete process.env.CLAUDE_MOCK_MODE;
});

afterEach(() => {
  delete process.env.CLAUDE_MOCK_MODE;
});

async function load() {
  const mod = await import("@/lib/providers/claude-cli");
  return mod;
}

describe("claude-cli generateText", () => {
  it("returns the result string on a valid envelope", async () => {
    process.env.CLAUDE_MOCK_MODE = "ok";
    const { generateText } = await load();
    const res = await generateText({ userPrompt: "give me a logo prompt" });
    expect(res.output).toMatch(/leaf|sage|wellness/i);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws invalid_request when the prompt is empty", async () => {
    const { generateText } = await load();
    await expect(generateText({ userPrompt: "   " })).rejects.toMatchObject({
      kind: "invalid_request",
    });
  });

  it("throws invalid_request when disabled by env", async () => {
    process.env.CLAUDE_REFINE_ENABLED = "false";
    const { generateText } = await load();
    await expect(generateText({ userPrompt: "x" })).rejects.toMatchObject({
      kind: "invalid_request",
    });
  });

  it("throws upstream when stdout is not valid JSON", async () => {
    process.env.CLAUDE_MOCK_MODE = "broken_json";
    const { generateText } = await load();
    await expect(generateText({ userPrompt: "x" })).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("throws upstream when the envelope reports is_error", async () => {
    process.env.CLAUDE_MOCK_MODE = "error_env";
    const { generateText } = await load();
    await expect(generateText({ userPrompt: "x" })).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("throws upstream when the envelope is missing the result field", async () => {
    process.env.CLAUDE_MOCK_MODE = "no_result";
    const { generateText } = await load();
    await expect(generateText({ userPrompt: "x" })).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("maps a credentials-flavored stderr to auth", async () => {
    process.env.CLAUDE_MOCK_MODE = "auth_fail";
    const { generateText } = await load();
    await expect(generateText({ userPrompt: "x" })).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("kills the child and throws upstream when stdout exceeds the size cap", async () => {
    process.env.CLAUDE_MOCK_MODE = "flood";
    const { generateText } = await load();
    await expect(generateText({ userPrompt: "x" })).rejects.toMatchObject({
      kind: "upstream",
    });
  });
});
