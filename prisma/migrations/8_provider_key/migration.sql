-- CreateTable
CREATE TABLE "ProviderKey" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "maskedHint" VARCHAR(8) NOT NULL,
    "defaultModel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unchecked',
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderKey_provider_key" ON "ProviderKey"("provider");
