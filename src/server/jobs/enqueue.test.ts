import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueBatchEstimate } from "./enqueue";

describe("enqueueBatchEstimate", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("returns false when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await enqueueBatchEstimate("batch_1")).toBe(false);
  });
});
