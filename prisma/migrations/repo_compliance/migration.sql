-- CreateTable
CREATE TABLE "RepoStandard" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoStandard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepoStandard_repoId_idx" ON "RepoStandard"("repoId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoStandard_repoId_key_key" ON "RepoStandard"("repoId", "key");

-- AddForeignKey
ALTER TABLE "RepoStandard" ADD CONSTRAINT "RepoStandard_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

