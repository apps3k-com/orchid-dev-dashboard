import { decryptSecret, encryptSecret } from "@/server/crypto";
import { prisma } from "@/server/db";
import { isProviderId, type ProviderId, PROVIDERS, validateProviderKey } from "@/server/llm/providers";

/** One stored key's masked summary for the settings UI. Never exposes the decrypted key. */
export type ProviderKeyView = {
  id: string;
  label: string;
  maskedHint: string;
  status: string; // unchecked | valid | invalid | rate_limited
  isDefault: boolean;
};

/** Per-provider settings + keys for the AI-Providers page + audit gating. */
export type ProviderSummary = {
  provider: ProviderId;
  label: string;
  models: string[];
  defaultModel: string; // configured default model (falls back to the provider's config default)
  keys: ProviderKeyView[];
  usable: boolean; // has at least one valid|rate_limited key
};

/** Build a per-provider summary (default model + masked keys) for the settings page + audit gating. */
export async function getProviderSummaries(): Promise<ProviderSummary[]> {
  const [keys, settings] = await Promise.all([
    prisma.providerKey.findMany({ orderBy: [{ isDefault: "desc" }, { label: "asc" }] }),
    prisma.providerSettings.findMany(),
  ]);
  const modelByProvider = new Map(settings.map((s) => [s.provider, s.defaultModel]));
  const keysByProvider = new Map<string, ProviderKeyView[]>();
  for (const k of keys) {
    const list = keysByProvider.get(k.provider) ?? [];
    list.push({ id: k.id, label: k.label, maskedHint: k.maskedHint, status: k.status, isDefault: k.isDefault });
    keysByProvider.set(k.provider, list);
  }
  return Object.values(PROVIDERS).map((cfg) => {
    const provKeys = keysByProvider.get(cfg.id) ?? [];
    // Fall back when a stored model is no longer offered (a retired model id).
    const stored = modelByProvider.get(cfg.id);
    const defaultModel = stored && cfg.models.includes(stored) ? stored : cfg.defaultModel;
    return {
      provider: cfg.id,
      label: cfg.label,
      models: cfg.models,
      defaultModel,
      keys: provKeys,
      usable: provKeys.some((k) => k.status === "valid" || k.status === "rate_limited"),
    };
  });
}

/** The model a provider uses for audits: its stored default, or the config fallback if unset/retired. */
export async function getProviderDefaultModel(provider: ProviderId): Promise<string> {
  const row = await prisma.providerSettings.findUnique({ where: { provider } });
  return row && PROVIDERS[provider].models.includes(row.defaultModel)
    ? row.defaultModel
    : PROVIDERS[provider].defaultModel;
}

/** Save a provider's default model (separate from any key — item 7's "Save settings"). */
export async function saveProviderSettings(
  provider: ProviderId,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!PROVIDERS[provider].models.includes(model)) {
    return { ok: false, error: "Unknown model for this provider." };
  }
  await prisma.providerSettings.upsert({
    where: { provider },
    create: { provider, defaultModel: model },
    update: { defaultModel: model },
  });
  return { ok: true };
}

/** Validate + encrypt + add a new labelled key for a provider. Validated against the provider's
 *  default model (a cheap test call); only stored once it authenticates. The first key for a provider
 *  becomes its default. */
export async function addProviderKey(
  provider: ProviderId,
  label: string,
  apiKey: string,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const trimmedLabel = label.trim() || "default";
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) return { ok: false, error: "Enter a valid API key." };

  const existing = await prisma.providerKey.findUnique({
    where: { provider_label: { provider, label: trimmedLabel } },
  });
  if (existing) return { ok: false, error: `A key labelled "${trimmedLabel}" already exists.` };

  const result = await validateProviderKey(provider, trimmed, await getProviderDefaultModel(provider));
  if (!result.ok && !result.rateLimited) return { ok: false, error: result.error ?? "Validation failed." };

  const count = await prisma.providerKey.count({ where: { provider } });
  await prisma.providerKey.create({
    data: {
      provider,
      label: trimmedLabel,
      keyEnc: encryptSecret(trimmed),
      maskedHint: `…${trimmed.slice(-4)}`,
      status: result.ok ? "valid" : "rate_limited",
      isDefault: count === 0, // first key for the provider is its default
      lastValidatedAt: new Date(),
    },
  });
  return { ok: true, warning: result.ok ? undefined : result.error };
}

/** Replace an existing key's secret (re-validated). Keeps its label + default flag. */
export async function replaceProviderKey(
  keyId: string,
  apiKey: string,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) return { ok: false, error: "Enter a valid API key." };
  const row = await prisma.providerKey.findUnique({ where: { id: keyId } });
  if (!row || !isProviderId(row.provider)) return { ok: false, error: "Key not found." };

  const result = await validateProviderKey(row.provider, trimmed, await getProviderDefaultModel(row.provider));
  if (!result.ok && !result.rateLimited) return { ok: false, error: result.error ?? "Validation failed." };

  await prisma.providerKey.update({
    where: { id: keyId },
    data: {
      keyEnc: encryptSecret(trimmed),
      maskedHint: `…${trimmed.slice(-4)}`,
      status: result.ok ? "valid" : "rate_limited",
      lastValidatedAt: new Date(),
    },
  });
  return { ok: true, warning: result.ok ? undefined : result.error };
}

/** Remove a key; if it was the default, promote the provider's oldest remaining key (if any). */
export async function removeProviderKey(keyId: string): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.providerKey.findUnique({ where: { id: keyId } });
  if (!row) return { ok: false, error: "Key not found." };
  await prisma.providerKey.delete({ where: { id: keyId } });
  if (row.isDefault) {
    const next = await prisma.providerKey.findFirst({
      where: { provider: row.provider },
      orderBy: { createdAt: "asc" },
    });
    if (next) await prisma.providerKey.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return { ok: true };
}

/** Make a key its provider's default (clears the flag on that provider's other keys, atomically). */
export async function setDefaultProviderKey(keyId: string): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.providerKey.findUnique({ where: { id: keyId } });
  if (!row) return { ok: false, error: "Key not found." };
  await prisma.$transaction([
    prisma.providerKey.updateMany({ where: { provider: row.provider }, data: { isDefault: false } }),
    prisma.providerKey.update({ where: { id: keyId }, data: { isDefault: true } }),
  ]);
  return { ok: true };
}

/** Decrypt a specific key by id (server-only; the audit worker uses the key chosen for the run). */
export async function getDecryptedProviderKeyById(keyId: string): Promise<string | null> {
  const row = await prisma.providerKey.findUnique({ where: { id: keyId } });
  return row ? decryptSecret(row.keyEnc) : null;
}

/** Decrypt a provider's DEFAULT key (server-only; used for cost estimates + as the audit fallback). */
export async function getDecryptedProviderKey(provider: ProviderId): Promise<string | null> {
  const row =
    (await prisma.providerKey.findFirst({ where: { provider, isDefault: true } })) ??
    (await prisma.providerKey.findFirst({ where: { provider }, orderBy: { createdAt: "asc" } }));
  return row ? decryptSecret(row.keyEnc) : null;
}
