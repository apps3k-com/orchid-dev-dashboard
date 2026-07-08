-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "repoId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signal_dedupeKey_key" ON "Signal"("dedupeKey");

-- CreateIndex
CREATE INDEX "Signal_source_kind_idx" ON "Signal"("source", "kind");

-- CreateIndex
CREATE INDEX "Signal_repoId_idx" ON "Signal"("repoId");

-- CreateIndex
CREATE INDEX "Signal_occurredAt_idx" ON "Signal"("occurredAt");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
