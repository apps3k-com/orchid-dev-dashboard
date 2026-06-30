import { decryptSecret, encryptSecret } from "@/server/crypto";
import { prisma } from "@/server/db";
import { type ProviderId, PROVIDERS, validateProviderKey } from "@/server/llm/providers";

/** Per-provider key status for the settings UI: static config merged with the stored (masked)
 *  record. Never exposes the decrypted key. */
export type ProviderKeySummary = {
  provider: ProviderId;
  label: string;
  models: string[];
  defaultModel: string;
  configured: boolean;
  status: string; // not configured | unchecked | valid | invalid
  maskedHint: string | null;
  selectedModel: string | null;
};

/** Build a masked status summary per supported provider for the AI-Providers settings card. */
export async function getProviderKeySummaries(): Promise<ProviderKeySummary[]> {
  const rows = await prisma.providerKey.findMany();
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return Object.values(PROVIDERS).map((cfg) => {
    const row = byProvider.get(cfg.id);
    // Fall back when a stored model is no longer offered, so replacing a key without touching the
    // select can't round-trip a retired model id that saveProviderKey would then reject.
    const selectedModel =
      row?.defaultModel && cfg.models.includes(row.defaultModel) ? row.defaultModel : null;
    return {
      provider: cfg.id,
      label: cfg.label,
      models: cfg.models,
      defaultModel: cfg.defaultModel,
      configured: Boolean(row),
      status: row?.status ?? "not configured",
      maskedHint: row?.maskedHint ?? null,
      selectedModel,
    };
  });
}

/** Validate a provider key (cheap test call), then encrypt + upsert it instance-wide. The key is
 *  only persisted once it validates, so an invalid/unreachable key is never stored. */
export async function saveProviderKey(
  provider: ProviderId,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const trimmed = apiKey.trim();
  // Length floor so `maskedHint` (last 4) can never reveal a whole (bogus) key, independent of the
  // provider test call. Real keys are far longer than this.
  if (trimmed.length < 8) return { ok: false, error: "Enter a valid API key." };
  if (!PROVIDERS[provider].models.includes(model)) {
    return { ok: false, error: "Unknown model for this provider." };
  }

  const result = await validateProviderKey(provider, trimmed, model);
  // A rate-limited / out-of-credits key still AUTHENTICATED, so it is valid — store it with a
  // "rate_limited" status instead of discarding it. Only a genuinely bad/unreachable key is rejected.
  if (!result.ok && !result.rateLimited) return { ok: false, error: result.error ?? "Validation failed." };

  const fields = {
    keyEnc: encryptSecret(trimmed),
    maskedHint: `…${trimmed.slice(-4)}`,
    defaultModel: model,
    status: result.ok ? "valid" : "rate_limited",
    lastValidatedAt: new Date(),
  };
  await prisma.providerKey.upsert({
    where: { provider },
    create: { provider, ...fields },
    update: fields,
  });
  return { ok: true, warning: result.ok ? undefined : result.error };
}

/** Decrypt the stored key for a provider (server-only; used by the audit worker). Null if unset. */
export async function getDecryptedProviderKey(provider: ProviderId): Promise<string | null> {
  const row = await prisma.providerKey.findUnique({ where: { provider } });
  return row ? decryptSecret(row.keyEnc) : null;
}
