import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("crypto", () => {
  const prev = process.env.APP_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY = "test-key-for-unit-tests-only";
  });
  afterAll(() => {
    process.env.APP_ENCRYPTION_KEY = prev;
  });

  it("round-trips a secret", () => {
    const secret = "-----BEGIN KEY-----\nabc123\n-----END KEY-----\n";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("rejects a tampered blob", () => {
    const blob = encryptSecret("secret");
    const [iv, tag] = blob.split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("evil").toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
