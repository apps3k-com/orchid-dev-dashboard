import { beforeEach, describe, expect, it, vi } from "vitest";

// getProviderSummaries only touches Prisma (no provider test call), so mock just the DB.
vi.mock("@/server/db", () => ({
  prisma: {
    providerKey: { findMany: vi.fn() },
    providerSettings: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/server/db";
import { getProviderSummaries } from "@/server/llm/keys";

const db = vi.mocked(prisma, true);

beforeEach(() => vi.clearAllMocks());

describe("getProviderSummaries", () => {
  it("groups keys per provider, marks usable, and keeps a stored (still-offered) default model", async () => {
    db.providerKey.findMany.mockResolvedValue([
      { id: "k1", provider: "anthropic", label: "team", maskedHint: "…aaaa", status: "valid", isDefault: true },
      { id: "k2", provider: "anthropic", label: "personal", maskedHint: "…bbbb", status: "invalid", isDefault: false },
    ] as never);
    db.providerSettings.findMany.mockResolvedValue([
      { provider: "anthropic", defaultModel: "claude-opus-4-8" },
    ] as never);

    const [anthropic] = await getProviderSummaries();
    expect(anthropic.provider).toBe("anthropic");
    expect(anthropic.defaultModel).toBe("claude-opus-4-8"); // stored + still offered
    expect(anthropic.usable).toBe(true); // k1 is valid
    expect(anthropic.keys.map((k) => k.id)).toEqual(["k1", "k2"]);
  });

  it("falls back to the config default model when the stored one is retired; usable=false with no good key", async () => {
    db.providerKey.findMany.mockResolvedValue([
      { id: "k1", provider: "anthropic", label: "default", maskedHint: "…cccc", status: "invalid", isDefault: true },
    ] as never);
    db.providerSettings.findMany.mockResolvedValue([
      { provider: "anthropic", defaultModel: "some-retired-model" },
    ] as never);

    const [anthropic] = await getProviderSummaries();
    expect(anthropic.defaultModel).toBe("claude-sonnet-4-6"); // PROVIDERS config fallback
    expect(anthropic.usable).toBe(false);
  });

  it("has no keys and the config default model for an unconfigured provider", async () => {
    db.providerKey.findMany.mockResolvedValue([] as never);
    db.providerSettings.findMany.mockResolvedValue([] as never);

    const [anthropic] = await getProviderSummaries();
    expect(anthropic.keys).toEqual([]);
    expect(anthropic.usable).toBe(false);
    expect(anthropic.defaultModel).toBe("claude-sonnet-4-6");
  });
});
