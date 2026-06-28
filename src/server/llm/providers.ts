// Provider/model registry for the BYOK auditor. Model IDs live here (a config map, not scattered
// through code) so they can be re-verified/updated as providers ship new versions. v1 = Anthropic.

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

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Narrow an arbitrary string to a known provider id. */
export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

/** Cheaply verify a provider key works, without spending tokens. For Anthropic this is the free
 *  `count_tokens` endpoint (200 = valid, 401/403 = bad key). Network errors are reported as not-ok
 *  rather than thrown. Never logs the key or the raw provider response (which can echo the key). */
export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
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
    if (res.status === 402) {
      return { ok: false, error: "Key is valid but the account has no credits — top it up and retry." };
    }
    return { ok: false, error: `Provider returned status ${res.status}.` };
  } catch {
    return { ok: false, error: "Could not reach the provider — please retry." };
  } finally {
    clearTimeout(timeout);
  }
}
