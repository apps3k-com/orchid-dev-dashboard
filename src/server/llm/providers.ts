// Provider/model registry for the BYOK auditor. Model IDs live here (a config map, not scattered
// through code) so they can be re-verified/updated as providers ship new versions. v1 = Anthropic.

/** Supported BYOK provider ids (v1 = Anthropic; OpenAI/Cursor are later phases). */
export type ProviderId = "anthropic";

/** Static configuration for one BYOK LLM provider. */
export interface ProviderConfig {
  id: ProviderId;
  label: string;
  keyPrefix: string; // expected key prefix (advisory only — real validation is a test call)
  defaultModel: string;
  models: string[];
}

/** Supported providers and their models (June 2026 — re-verify when providers ship new versions).
 *  Default to the latest Claude models; deep audits can opt into Opus. */
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyPrefix: "sk-ant-",
    defaultModel: "claude-sonnet-4-6",
    models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
  },
};

/** All supported provider ids, for iteration. */
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Per-model token pricing in USD per 1M tokens (June 2026 standard rates — re-verify when models
 *  change). Used only to estimate audit cost for the per-run budget guard. */
export const MODEL_PRICING: Record<string, { inPerM: number; outPerM: number }> = {
  "claude-sonnet-4-6": { inPerM: 3, outPerM: 15 },
  "claude-opus-4-8": { inPerM: 5, outPerM: 25 },
  "claude-haiku-4-5": { inPerM: 1, outPerM: 5 },
};

/** Narrow an arbitrary string to a known provider id. */
export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

/** Cheaply verify a provider key works, without spending tokens. For Anthropic this is the free
 *  `count_tokens` endpoint: 200 = valid; 401/403 = bad key; and 429 or a 400/402 usage-or-credit cap
 *  = `rateLimited` (the key authenticated, so it is valid but temporarily capped). Network errors are
 *  reported as not-ok rather than thrown. Never logs the key or the raw provider response. */
export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string; rateLimited?: boolean }> {
  if (provider !== "anthropic") return { ok: false, error: "Unsupported provider." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }] }),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid API key." };
    // Parse the provider's own error detail (parsed message only — never the raw body, which can echo
    // the key) so the failure is actionable.
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      // non-JSON error body — ignore
    }
    // The key AUTHENTICATED (past 401/403) but the account hit a usage/credit/rate cap: Anthropic
    // returns 400 (not 402) for "credit balance too low" and for usage-limit caps, and 429 for rate
    // limits. The key is valid → flag it rate-limited so the caller can still store it + show status.
    if (
      res.status === 429 ||
      res.status === 402 ||
      /credit balance|usage limit|rate limit/i.test(detail)
    ) {
      return {
        ok: false,
        rateLimited: true,
        error: detail || "Rate-limited or out of credits — the key is valid but temporarily capped.",
      };
    }
    return { ok: false, error: `Provider returned status ${res.status}${detail ? `: ${detail}` : ""}.` };
  } catch {
    return { ok: false, error: "Could not reach the provider — please retry." };
  } finally {
    clearTimeout(timeout);
  }
}
