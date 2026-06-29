import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decryptSecret,
  decryptSecretWith,
  encryptSecret,
  encryptSecretWith,
  rotateBlob,
} from "./crypto";

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

  it("rejects blobs without exactly three non-empty segments", () => {
    const blob = encryptSecret("secret");
    expect(() => decryptSecret(`${blob}:extra`)).toThrow("Malformed encrypted blob");
    expect(() => decryptSecret("only:two")).toThrow("Malformed encrypted blob");
    const [iv, tag] = blob.split(":");
    expect(() => decryptSecret(`${iv}:${tag}:`)).toThrow("Malformed encrypted blob");
  });
});

describe("crypto key rotation", () => {
  const OLD = "old-encryption-secret";
  const NEW = "new-encryption-secret";

  it("round-trips under an explicit secret", () => {
    expect(decryptSecretWith(encryptSecretWith("s3cret", OLD), OLD)).toBe("s3cret");
  });

  it("cannot decrypt an old-key blob with the new key", () => {
    const blob = encryptSecretWith("s3cret", OLD);
    expect(() => decryptSecretWith(blob, NEW)).toThrow();
  });

  it("rotateBlob re-encrypts so the value decrypts under the new key (not the old)", () => {
    const original = "-----BEGIN KEY-----\nrotate-me\n-----END KEY-----\n";
    const rotated = rotateBlob(encryptSecretWith(original, OLD), OLD, NEW);
    expect(decryptSecretWith(rotated, NEW)).toBe(original);
    expect(() => decryptSecretWith(rotated, OLD)).toThrow();
  });

  it("rotateBlob throws when the old secret is wrong", () => {
    const blob = encryptSecretWith("s3cret", OLD);
    expect(() => rotateBlob(blob, "wrong", NEW)).toThrow();
  });
});
