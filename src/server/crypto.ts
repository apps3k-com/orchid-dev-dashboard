import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Derive a 32-byte AES key from an arbitrary secret string. */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** The active at-rest secret: APP_ENCRYPTION_KEY (preferred) or SESSION_SECRET. */
function currentSecret(): string {
  const secret = process.env.APP_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("APP_ENCRYPTION_KEY or SESSION_SECRET must be set to encrypt secrets at rest");
  }
  return secret;
}

/** Encrypt with AES-256-GCM under an explicit secret. Returns `iv:tag:ciphertext` (base64 parts). */
export function encryptSecretWith(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(":");
}

/** Decrypt an {@link encryptSecretWith} blob under an explicit secret. Throws on a wrong key or a
 *  tampered ciphertext (GCM auth-tag mismatch) or a malformed blob. */
export function decryptSecretWith(blob: string, secret: string): string {
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted blob");
  const [iv, tag, enc] = parts.map((part) => Buffer.from(part, "base64"));
  if (!iv.length || !tag.length || !enc.length) throw new Error("Malformed encrypted blob");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Re-encrypt one blob from `oldSecret` to `newSecret` (for key rotation). Throws if it can't be
 *  decrypted with `oldSecret`. */
export function rotateBlob(blob: string, oldSecret: string, newSecret: string): string {
  return encryptSecretWith(decryptSecretWith(blob, oldSecret), newSecret);
}

/**
 * Encrypt a secret for storage at rest with AES-256-GCM under the active key.
 *
 * @param plaintext - The secret value (e.g. a GitHub App private key).
 * @returns `iv:tag:ciphertext`, each part base64-encoded.
 */
export function encryptSecret(plaintext: string): string {
  return encryptSecretWith(plaintext, currentSecret());
}

/**
 * Decrypt a value produced by {@link encryptSecret} under the active key. Throws if the key is wrong
 * or the ciphertext was tampered with (GCM auth tag mismatch).
 *
 * @param blob - The `iv:tag:ciphertext` string.
 * @returns The decrypted plaintext.
 */
export function decryptSecret(blob: string): string {
  return decryptSecretWith(blob, currentSecret());
}
