#!/usr/bin/env node
// Re-encrypt every at-rest secret from APP_ENCRYPTION_KEY_OLD to APP_ENCRYPTION_KEY.
//
// Key rotation is an OFFLINE op (the app derives one key from env at a time). Procedure:
//   1. Stop the app.
//   2. APP_ENCRYPTION_KEY_OLD=<current> APP_ENCRYPTION_KEY=<new> pnpm key:rotate
//   3. Start the app with APP_ENCRYPTION_KEY=<new> (drop APP_ENCRYPTION_KEY_OLD).
//
// The crypto format mirrors src/server/crypto.ts (AES-256-GCM, sha256-derived key,
// `iv:tag:ciphertext` base64). Decrypt+re-encrypt happens fully in memory first, so a wrong old
// key aborts before anything is written; the writes then run in a single transaction.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const deriveKey = (secret) => createHash("sha256").update(secret).digest();

const decryptWith = (blob, secret) => {
  const [iv, tag, enc] = blob.split(":").map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !enc) throw new Error("Malformed encrypted blob");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
};

const encryptWith = (plaintext, secret) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(":");
};

const rotate = (blob, oldSecret, newSecret) => encryptWith(decryptWith(blob, oldSecret), newSecret);

const OLD = process.env.APP_ENCRYPTION_KEY_OLD;
const NEW = process.env.APP_ENCRYPTION_KEY;
if (!OLD || !NEW) {
  console.error(
    "Set APP_ENCRYPTION_KEY_OLD (current key) and APP_ENCRYPTION_KEY (new key).\n" +
      "If you never set APP_ENCRYPTION_KEY, secrets were encrypted under SESSION_SECRET — " +
      "use that value for APP_ENCRYPTION_KEY_OLD.",
  );
  process.exit(1);
}
if (OLD === NEW) {
  console.error("APP_ENCRYPTION_KEY_OLD must differ from APP_ENCRYPTION_KEY.");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  // One interactive transaction: reads + re-encrypts + writes atomically (consistent snapshot, no
  // read/write race) and rolls back entirely if any decrypt throws (a wrong old key writes nothing).
  const result = await prisma.$transaction(async (tx) => {
    const cfg = await tx.appConfig.findFirst();
    if (cfg) {
      await tx.appConfig.update({
        where: { id: cfg.id },
        data: {
          privateKeyEnc: rotate(cfg.privateKeyEnc, OLD, NEW),
          clientSecretEnc: rotate(cfg.clientSecretEnc, OLD, NEW),
          webhookSecretEnc: cfg.webhookSecretEnc ? rotate(cfg.webhookSecretEnc, OLD, NEW) : null,
        },
      });
    }
    const keys = await tx.providerKey.findMany();
    for (const k of keys) {
      await tx.providerKey.update({
        where: { id: k.id },
        data: { keyEnc: rotate(k.keyEnc, OLD, NEW) },
      });
    }
    return { appConfig: cfg ? 1 : 0, providerKeys: keys.length };
  });

  console.log(
    `Re-encrypted ${result.appConfig} AppConfig row + ${result.providerKeys} ProviderKey row(s).`,
  );
  console.log("Now restart the app with APP_ENCRYPTION_KEY set to the new key (drop the _OLD var).");
} catch (error) {
  console.error(
    "Rotation failed — no changes were written if this was a decrypt error:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
