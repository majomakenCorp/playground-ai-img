import "server-only";
import { spawn } from "node:child_process";
import { env } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";

const PROVIDER_ID = "claude-cli";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_PROMPT_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;

export interface GenerateTextInput {
  userPrompt: string;
}

export interface GenerateTextResult {
  output: string;
  durationMs: number;
}

type CliEnvelope = {
  result?: string;
  is_error?: boolean;
  subtype?: string;
};

export async function generateText(
  input: GenerateTextInput,
): Promise<GenerateTextResult> {
  if (!env.CLAUDE_REFINE_ENABLED) {
    throw new ProviderError({
      kind: "invalid_request",
      providerId: PROVIDER_ID,
      message: "claude CLI is disabled (CLAUDE_REFINE_ENABLED=false)",
    });
  }

  const userPrompt = input.userPrompt.trim();
  if (!userPrompt) {
    throw new ProviderError({
      kind: "invalid_request",
      providerId: PROVIDER_ID,
      message: "prompt is empty",
    });
  }
  if (Buffer.byteLength(userPrompt, "utf8") > MAX_PROMPT_BYTES) {
    throw new ProviderError({
      kind: "invalid_request",
      providerId: PROVIDER_ID,
      message: `prompt exceeds ${MAX_PROMPT_BYTES} bytes`,
    });
  }

  const started = Date.now();

  const args = [
    "-p",
    "--output-format",
    "json",
    "--disallowedTools",
    "*",
  ];

  const child = spawn(env.CLAUDE_CLI_PATH, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      LC_ALL: "C.UTF-8",
      LANG: "C.UTF-8",
    },
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let killedForSize = false;
  let killedForTimeout = false;

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_OUTPUT_BYTES) {
      if (!killedForSize) {
        killedForSize = true;
        child.kill("SIGKILL");
      }
      return;
    }
    stdoutChunks.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderrBytes < 4096) {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
    }
  });

  const timeout = setTimeout(() => {
    killedForTimeout = true;
    child.kill("SIGKILL");
  }, REQUEST_TIMEOUT_MS);

  child.stdin.write(userPrompt);
  child.stdin.end();

  const exit = await new Promise<{ code: number | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code }));
  }).finally(() => clearTimeout(timeout));

  const durationMs = Date.now() - started;

  if (killedForTimeout) {
    throw new ProviderError({
      kind: "timeout",
      providerId: PROVIDER_ID,
      message: `claude CLI timed out after ${REQUEST_TIMEOUT_MS} ms`,
    });
  }
  if (killedForSize) {
    throw new ProviderError({
      kind: "upstream",
      providerId: PROVIDER_ID,
      message: `claude CLI output exceeded ${MAX_OUTPUT_BYTES} bytes`,
    });
  }
  if (exit.code !== 0) {
    const stderr = Buffer.concat(stderrChunks).toString("utf8").slice(0, 500);
    if (/not\s*logged\s*in|unauthor|forbidden|credentials?/i.test(stderr)) {
      throw new ProviderError({
        kind: "auth",
        providerId: PROVIDER_ID,
        message: "claude CLI authentication failed",
      });
    }
    throw new ProviderError({
      kind: "upstream",
      providerId: PROVIDER_ID,
      message: `claude CLI exited with code ${exit.code}`,
    });
  }

  const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
  let envelope: CliEnvelope;
  try {
    envelope = JSON.parse(stdout) as CliEnvelope;
  } catch {
    throw new ProviderError({
      kind: "upstream",
      providerId: PROVIDER_ID,
      message: "claude CLI returned non-JSON output",
    });
  }

  if (envelope.is_error || typeof envelope.result !== "string") {
    throw new ProviderError({
      kind: "upstream",
      providerId: PROVIDER_ID,
      message: `claude CLI envelope error (subtype=${envelope.subtype ?? "unknown"})`,
    });
  }

  return {
    output: envelope.result,
    durationMs,
  };
}
