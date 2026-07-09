-- CreateTable
CREATE TABLE "DecisionDismissal" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "dismissedBy" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionDismissal_dedupeKey_key" ON "DecisionDismissal"("dedupeKey");
