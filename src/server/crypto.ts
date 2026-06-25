import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Derive a 32-byte AES key from APP_ENCRYPTION_KEY (preferred) or SESSION_SECRET. */
function encryptionKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("APP_ENCRYPTION_KEY or SESSION_SECRET must be set to encrypt secrets at rest");
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a secret for storage at rest with AES-256-GCM.
 *
 * @param plaintext - The secret value (e.g. a GitHub App private key).
 * @returns `iv:tag:ciphertext`, each part base64-encoded.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(":");
}

/**
 * Decrypt a value produced by {@link encryptSecret}. Throws if the key is wrong
 * or the ciphertext was tampered with (GCM auth tag mismatch).
 *
 * @param blob - The `iv:tag:ciphertext` string.
 * @returns The decrypted plaintext.
 */
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(":").map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !enc) throw new Error("Malformed encrypted blob");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
