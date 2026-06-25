-- CreateTable
CREATE TABLE "AppConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "appId" INTEGER NOT NULL,
    "slug" TEXT,
    "clientId" TEXT NOT NULL,
    "privateKeyEnc" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "webhookSecretEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);
