-- CreateTable
CREATE TABLE "ProviderSettings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "defaultModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSettings_provider_key" ON "ProviderSettings"("provider");

-- Data migration: preserve each provider's default model before dropping the column.
INSERT INTO "ProviderSettings" ("id", "provider", "defaultModel", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "provider", "defaultModel", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProviderKey"
WHERE "defaultModel" IS NOT NULL;

-- AlterTable
ALTER TABLE "ProviderKey" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "ProviderKey" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Data migration: the existing single key per provider becomes that provider's default.
UPDATE "ProviderKey" SET "isDefault" = true;

-- AlterTable
ALTER TABLE "ProviderKey" DROP COLUMN "defaultModel";

-- DropIndex
DROP INDEX "ProviderKey_provider_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProviderKey_provider_label_key" ON "ProviderKey"("provider", "label");

-- CreateIndex
CREATE INDEX "ProviderKey_provider_idx" ON "ProviderKey"("provider");

-- CreateIndex: partial unique constraint on provider where isDefault is true (one default per provider).
CREATE UNIQUE INDEX "ProviderKey_provider_isDefault_key" ON "ProviderKey"("provider") WHERE "isDefault" = true;

-- AlterTable
ALTER TABLE "RepoAudit" ADD COLUMN "providerKeyId" TEXT;
