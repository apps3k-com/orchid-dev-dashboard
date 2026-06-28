-- CreateTable
CREATE TABLE "RepoAudit" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "commitSha" TEXT,
    "score" INTEGER,
    "summary" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedUsd" DECIMAL(10,4),
    "error" TEXT,
    "triggeredByLogin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RepoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "lineHint" INTEGER,
    "evidence" TEXT,
    "rationale" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "autoFixable" BOOLEAN NOT NULL DEFAULT false,
    "proposedPatch" TEXT,
    "state" TEXT NOT NULL DEFAULT 'open',
    "prUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepoAudit_repoId_idx" ON "RepoAudit"("repoId");

-- CreateIndex
CREATE INDEX "RepoAudit_status_idx" ON "RepoAudit"("status");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_idx" ON "AuditFinding"("auditId");

-- AddForeignKey
ALTER TABLE "RepoAudit" ADD CONSTRAINT "RepoAudit_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "RepoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
