-- CreateTable
CREATE TABLE "AuditBatch" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'estimating',
    "force" BOOLEAN NOT NULL DEFAULT false,
    "triggeredByLogin" TEXT,
    "totalEstimatedUsd" DECIMAL(10,4),
    "totalEstimatedInputTokens" INTEGER,
    "repoCount" INTEGER NOT NULL,
    "auditCount" INTEGER,
    "skippedCount" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuditBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "estimatedInputTokens" INTEGER,
    "estimatedUsd" DECIMAL(10,4),
    "commitSha" TEXT,
    "lastAuditCommitSha" TEXT,
    "error" TEXT,
    "auditId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditBatch_status_idx" ON "AuditBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditBatchItem_auditId_key" ON "AuditBatchItem"("auditId");

-- CreateIndex
CREATE INDEX "AuditBatchItem_batchId_idx" ON "AuditBatchItem"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditBatchItem_batchId_repoId_key" ON "AuditBatchItem"("batchId", "repoId");

-- AddForeignKey
ALTER TABLE "AuditBatchItem" ADD CONSTRAINT "AuditBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AuditBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditBatchItem" ADD CONSTRAINT "AuditBatchItem_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditBatchItem" ADD CONSTRAINT "AuditBatchItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "RepoAudit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
