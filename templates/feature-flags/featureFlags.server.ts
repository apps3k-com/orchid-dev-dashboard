/**
 * Server-side GrowthBook feature-flag abstraction (Node / API / Directus API
 * extension / Shopify-app backend / worker).
 *
 * Copy into the repo's central flag layer. The rest of the code imports only from
 * here. Server-side, targeting rules stay private (local evaluation); create a
 * per-request evaluator with that request's attributes. Config is ENV-only (no
 * public prefix — these are server env vars). Fail-safe: when disabled,
 * unconfigured or unreachable, every flag returns its default; nothing throws.
 */
import { GrowthBook } from "@growthbook/growthbook";

/** Non-sensitive attributes passed to GrowthBook for targeting. No PII. */
export interface FeatureFlagAttributes {
  id?: string;
  userId?: string;
  accountId?: string;
  tenantId?: string;
  role?: string;
  plan?: string;
  country?: string;
  isInternal?: boolean;
}

/** Resolver returned per request; all methods are fail-safe. */
export interface FeatureFlags {
  isOn(key: string, defaultValue?: boolean): boolean;
  getValue<T>(key: string, defaultValue: T): T;
  getJson<T>(key: string, defaultValue: T): T;
}

const SAFE_DEFAULTS: FeatureFlags = {
  isOn: (_key, d = false) => d,
  getValue: (_key, d) => d,
  getJson: (_key, d) => d,
};

/**
 * Builds a fail-safe {@link FeatureFlags} resolver scoped to `attributes`.
 * Returns safe defaults when GrowthBook is disabled, unconfigured or unreachable.
 * Prefer constructing one per request so targeting uses that request's context.
 */
export async function createFeatureFlags(attributes: FeatureFlagAttributes = {}): Promise<FeatureFlags> {
  const enabled = process.env.GROWTHBOOK_ENABLED === "true";
  const apiHost = process.env.GROWTHBOOK_API_HOST;
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY;
  if (!enabled || !apiHost || !clientKey) return SAFE_DEFAULTS;

  let gb: GrowthBook;
  try {
    gb = new GrowthBook({ apiHost, clientKey, enabled: true, attributes });
    await gb.init();
  } catch {
    return SAFE_DEFAULTS;
  }

  return {
    isOn: (key, d = false) => {
      try {
        return gb.isOn(key);
      } catch {
        return d;
      }
    },
    getValue: (key, d) => {
      try {
        return gb.getFeatureValue(key, d) as typeof d;
      } catch {
        return d;
      }
    },
    getJson: (key, d) => {
      try {
        return gb.getFeatureValue(key, d) as typeof d;
      } catch {
        return d;
      }
    },
  };
}
