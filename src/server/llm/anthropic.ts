import { AUDIT_JSON_SCHEMA, type AuditResult } from "@/server/llm/audit-schema";

// Minimal Anthropic Messages API client (no SDK dep — keeps the bundle lean). Targets the GA
// structured-output mode (`output_config.format` + json_schema). Never logs the key or raw bodies.
const API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

function headers(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

/** POST JSON with an explicit timeout (aborts a hung connection so it can't block the worker). */
async function postJson(path: string, apiKey: string, body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Free input-token count for a prompt, used for the pre-run cost estimate / budget guard. */
export async function countInputTokens(
  apiKey: string,
  model: string,
  system: string,
  content: string,
): Promise<number> {
  const res = await postJson(
    "/messages/count_tokens",
    apiKey,
    { model, system, messages: [{ role: "user", content }] },
    20_000,
  );
  if (!res.ok) throw new Error(`count_tokens failed with status ${res.status}`);
  const data = (await res.json()) as { input_tokens?: number };
  return data.input_tokens ?? 0;
}

/** Run the audit prompt with schema-constrained structured output. Returns the parsed result and
 *  token usage. Throws on a non-2xx response or unparseable output (never includes the raw body). */
export async function runAuditMessage(
  apiKey: string,
  model: string,
  system: string,
  content: string,
  maxTokens: number,
): Promise<{ result: AuditResult; inputTokens: number; outputTokens: number }> {
  const res = await postJson(
    "/messages",
    apiKey,
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      output_config: {
        format: { type: "json_schema", name: "audit_result", schema: AUDIT_JSON_SCHEMA },
      },
    },
    120_000,
  );
  if (!res.ok) throw new Error(`messages failed with status ${res.status}`);

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  // Structured output is returned as a single JSON text block; take the first to avoid concatenating
  // an incidental second text block into invalid JSON.
  const text =
    (data.content ?? []).find((block) => block.type === "text" && typeof block.text === "string")
      ?.text ?? "";

  let result: AuditResult;
  try {
    result = JSON.parse(text) as AuditResult;
  } catch {
    throw new Error("provider returned unparseable structured output");
  }
  return {
    result,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
