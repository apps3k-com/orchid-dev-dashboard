/**
 * Client-side GrowthBook feature-flag abstraction (browser / SSG / client islands).
 *
 * Copy into the repo's central flag layer (e.g. src/lib/feature-flags). The rest
 * of the code imports only from here — never the GrowthBook SDK directly. Only
 * harmless UI flags belong client-side (the SDK key is public); sensitive
 * targeting rules must use the GrowthBook proxy (remote evaluation).
 *
 * Config is ENV-only and read inside `initFeatureFlags` so the module stays
 * side-effect-free and unit-testable. Client-exposed env needs the framework's
 * public prefix (Astro/Vite: `PUBLIC_`, Next.js: `NEXT_PUBLIC_`). Fail-safe: when
 * disabled, unconfigured or unreachable, every flag returns its default; nothing throws.
 */
import { GrowthBook } from "@growthbook/growthbook";

/** Non-sensitive attributes passed to GrowthBook for targeting. No PII. */
export interface FeatureFlagAttributes {
  id?: string;
  country?: string;
  locale?: string;
  platform?: string;
  isInternal?: boolean;
}

/** Stable, business-readable flag keys. Add flags here, never inline. */
export const FLAGS = {
  /** Demo/test flag — replace with real flags. */
  testBanner: "<repo>-test-banner",
} as const;

let client: GrowthBook | null = null;

/**
 * Initialises GrowthBook from the public env vars and attributes. Fail-safe:
 * leaves the client unset (every flag returns its default) when disabled,
 * unconfigured or unreachable. Never throws.
 */
export async function initFeatureFlags(attributes: FeatureFlagAttributes = {}): Promise<void> {
  // Replace with the framework's public env accessor (import.meta.env.PUBLIC_* / process.env.NEXT_PUBLIC_*).
  const enabled = import.meta.env.PUBLIC_GROWTHBOOK_ENABLED === "true";
  const apiHost = import.meta.env.PUBLIC_GROWTHBOOK_API_HOST;
  const clientKey = import.meta.env.PUBLIC_GROWTHBOOK_CLIENT_KEY;
  if (!enabled || !apiHost || !clientKey) {
    client = null;
    return;
  }
  try {
    const instance = new GrowthBook({ apiHost, clientKey, enabled: true, attributes });
    await instance.init();
    client = instance;
  } catch {
    client = null;
  }
}

/** Test seam: inject a preconfigured GrowthBook (or null) without network I/O. */
export function __setFeatureFlagClientForTesting(instance: GrowthBook | null): void {
  client = instance;
}

/** True when `key` is on; returns `defaultValue` (default false) when unavailable. */
export function isOn(key: string, defaultValue = false): boolean {
  if (!client) return defaultValue;
  try {
    return client.isOn(key);
  } catch {
    return defaultValue;
  }
}

/** Returns the value of `key`, or `defaultValue` when GrowthBook is unavailable. */
export function getValue<T>(key: string, defaultValue: T): T {
  if (!client) return defaultValue;
  try {
    return client.getFeatureValue(key, defaultValue) as T;
  } catch {
    return defaultValue;
  }
}

/** Returns a JSON feature value for `key`, or `defaultValue` when unavailable. */
export function getJson<T>(key: string, defaultValue: T): T {
  return getValue<T>(key, defaultValue);
}
