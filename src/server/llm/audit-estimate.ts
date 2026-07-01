import { prisma } from "@/server/db";
import { countInputTokens } from "@/server/llm/anthropic";
import { AUDIT_MAX_OUTPUT_TOKENS, SYSTEM_PROMPT, buildContent, estimateUsd } from "@/server/llm/audit";
import { aggregateEstimate, decideStaleness, type ItemDecision } from "@/server/llm/audit-batch";
import { collectAuditContext, getDefaultBranchHeadSha } from "@/server/llm/context";
import { getDecryptedProviderKey } from "@/server/llm/keys";
import { PROVIDERS } from "@/server/llm/providers";
import { briefError } from "@/server/log";

/** The `audit:estimate` worker task: for each item in a batch, decide skip-vs-audit (by commit) and,
 *  for audits, compute the exact input-token cost via the free preflight — mirroring the per-run cost
 *  basis. Per-item errors are recorded on the item; a fatal error fails the whole batch. Never throws. */
export async function runBatchEstimate(batchId: string): Promise<void> {
  const batch = await prisma.auditBatch.findUnique({
    where: { id: batchId },
    include: { items: { include: { repo: true } } },
  });
  if (!batch || batch.status !== "estimating") return;
  const model = PROVIDERS.anthropic.defaultModel;

  try {
    const apiKey = await getDecryptedProviderKey("anthropic");
    if (!apiKey) throw new Error("No Anthropic key configured.");

    for (const item of batch.items) {
      try {
        const last = await prisma.repoAudit.findFirst({
          where: { repoId: item.repoId, status: "completed" },
          orderBy: { createdAt: "desc" },
          select: { commitSha: true },
        });
        const currentSha = await getDefaultBranchHeadSha(item.repo);
        const decision = decideStaleness({
          force: batch.force,
          currentSha,
          lastCompletedSha: last?.commitSha ?? null,
        });
        if (decision === "skip_unchanged") {
          await prisma.auditBatchItem.update({
            where: { id: item.id },
            data: {
              decision,
              commitSha: currentSha,
              lastAuditCommitSha: last?.commitSha ?? null,
              estimatedUsd: 0,
              estimatedInputTokens: 0,
            },
          });
          continue;
        }
        const { files, omitted } = await collectAuditContext(item.repo);
        if (files.length === 0) {
          await prisma.auditBatchItem.update({
            where: { id: item.id },
            data: { decision: "skip_no_config", commitSha: currentSha },
          });
          continue;
        }
        const hookStates = await prisma.repoHookState.findMany({
          where: { repoId: item.repoId },
          select: { path: true, status: true },
        });
        const content = buildContent(item.repo, files, hookStates, omitted);
        const inputTokens = await countInputTokens(apiKey, model, SYSTEM_PROMPT, content);
        await prisma.auditBatchItem.update({
          where: { id: item.id },
          data: {
            decision: "will_audit",
            commitSha: currentSha,
            estimatedInputTokens: inputTokens,
            estimatedUsd: estimateUsd(model, inputTokens, AUDIT_MAX_OUTPUT_TOKENS),
          },
        });
      } catch (error) {
        await prisma.auditBatchItem
          .update({ where: { id: item.id }, data: { decision: "error", error: briefError(error).message } })
          .catch(() => {});
      }
    }

    const items = await prisma.auditBatchItem.findMany({
      where: { batchId },
      select: { decision: true, estimatedUsd: true, estimatedInputTokens: true },
    });
    const totals = aggregateEstimate(
      items.map((i) => ({
        decision: i.decision as ItemDecision,
        estimatedUsd: i.estimatedUsd ? Number(i.estimatedUsd) : null,
        estimatedInputTokens: i.estimatedInputTokens,
      })),
    );
    await prisma.auditBatch.update({
      where: { id: batchId },
      data: {
        status: "estimated",
        estimatedAt: new Date(),
        totalEstimatedUsd: totals.totalEstimatedUsd,
        totalEstimatedInputTokens: totals.totalEstimatedInputTokens,
        auditCount: totals.auditCount,
        skippedCount: totals.skippedCount,
      },
    });
  } catch (error) {
    await prisma.auditBatch
      .update({ where: { id: batchId }, data: { status: "failed", error: briefError(error).message } })
      .catch(() => {});
  }
}
