-- CreateTable
CREATE TABLE "AutomationInstall" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL,
    "prUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationInstall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationInstall_repoId_idx" ON "AutomationInstall"("repoId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationInstall_repoId_recipeId_key" ON "AutomationInstall"("repoId", "recipeId");

-- AddForeignKey
ALTER TABLE "AutomationInstall" ADD CONSTRAINT "AutomationInstall_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
