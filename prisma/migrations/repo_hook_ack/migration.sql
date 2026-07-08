-- AlterTable
ALTER TABLE "RepoHookState" ADD COLUMN "acknowledgedRepoSha" TEXT;
ALTER TABLE "RepoHookState" ADD COLUMN "acknowledgedTemplateSha" TEXT;
ALTER TABLE "RepoHookState" ADD COLUMN "acknowledgedBy" TEXT;
ALTER TABLE "RepoHookState" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
