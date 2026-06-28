-- CreateTable
CREATE TABLE "RepoHookState" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "repoSha" TEXT,
    "templateSha" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoHookState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepoHookState_repoId_idx" ON "RepoHookState"("repoId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoHookState_repoId_path_key" ON "RepoHookState"("repoId", "path");

-- AddForeignKey
ALTER TABLE "RepoHookState" ADD CONSTRAINT "RepoHookState_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
