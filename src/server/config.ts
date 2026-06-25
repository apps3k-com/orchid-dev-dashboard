import { decryptSecret, encryptSecret } from "@/server/crypto";
import { prisma } from "@/server/db";

/** Effective GitHub App credentials for this instance (decrypted). */
export interface AppCredentials {
  appId: number;
  slug: string | null;
  clientId: string;
  privateKey: string;
  clientSecret: string;
  webhookSecret: string | null;
}

/** Plaintext credentials to persist (from the manifest conversion). */
export interface AppCredentialsInput {
  appId: number;
  slug?: string | null;
  clientId: string;
  privateKey: string;
  clientSecret: string;
  webhookSecret?: string | null;
}

function fromEnv(): AppCredentials | null {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET } =
    process.env;
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY || !GITHUB_APP_CLIENT_ID || !GITHUB_APP_CLIENT_SECRET) {
    return null;
  }
  return {
    appId: Number(GITHUB_APP_ID),
    slug: null,
    clientId: GITHUB_APP_CLIENT_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY,
    clientSecret: GITHUB_APP_CLIENT_SECRET,
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET ?? null,
  };
}

/**
 * Resolve the GitHub App credentials for this instance: an env-provided App takes
 * precedence (pre-seeded self-host); otherwise the singleton row written by the
 * /setup manifest flow. Returns null when not configured yet.
 */
export async function getAppConfig(): Promise<AppCredentials | null> {
  const env = fromEnv();
  if (env) return env;
  const row = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!row) return null;
  return {
    appId: row.appId,
    slug: row.slug,
    clientId: row.clientId,
    privateKey: decryptSecret(row.privateKeyEnc),
    clientSecret: decryptSecret(row.clientSecretEnc),
    webhookSecret: row.webhookSecretEnc ? decryptSecret(row.webhookSecretEnc) : null,
  };
}

/** Persist the App credentials (secrets encrypted at rest) as the singleton row. */
export async function saveAppConfig(input: AppCredentialsInput): Promise<void> {
  const data = {
    appId: input.appId,
    slug: input.slug ?? null,
    clientId: input.clientId,
    privateKeyEnc: encryptSecret(input.privateKey),
    clientSecretEnc: encryptSecret(input.clientSecret),
    webhookSecretEnc: input.webhookSecret ? encryptSecret(input.webhookSecret) : null,
  };
  await prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
}

/** True when the GitHub App is configured (env or DB). */
export async function isConfigured(): Promise<boolean> {
  return (await getAppConfig()) !== null;
}
