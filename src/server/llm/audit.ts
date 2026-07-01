import type { Repo } from "@prisma/client";

import { prisma } from "@/server/db";
import { countInputTokens, runAuditMessage } from "@/server/llm/anthropic";
import { type AuditFindingResult, validateFindings } from "@/server/llm/audit-schema";
import { type AuditFile, collectAuditContext } from "@/server/llm/context";
import { getDecryptedProviderKey } from "@/server/llm/keys";
import { MODEL_PRICING } from "@/server/llm/providers";
import { briefError } from "@/server/log";

/** Output-token budget reserved per audit (for the cost estimate + the request cap). */
export const AUDIT_MAX_OUTPUT_TOKENS = 8000;

export const SYSTEM_PROMPT = [
  "You are a defensive configuration reviewer for a repository's AI coding-agent and CI hook setup",
  "(.claude/**, .codex/**, AGENTS.md/CLAUDE.md/CODEX.md, .github/workflows/*, .coderabbit.yaml,",
  "docs/agents/*). Review ONLY the provided files and report redundancies, misconfigurations,",
  "security issues (unpinned actions, pull_request_target misuse, plaintext secrets, over-permissive",
  "hooks), optimizations, inconsistencies, missing pieces, and deprecated patterns — so the repo has",
  "a stringent, consistent agent + hook concept.",
  "",
  "Rules: only report a finding backed by a specific provided file, with a verbatim `evidence`",
  "snippet copied from that file where possible. NEVER invent files, paths, or content. Prefer",
  "high-signal findings over nitpicks. For an `autoFixable` finding, set `proposedPatch` to the",
  "COMPLETE replacement content of that single file. `score` is overall config health 0-100.",
  "Respond with the structured JSON only.",
].join(" ");

/** Estimated USD cost of a run, from the per-model token prices (for the budget guard). */
export function estimateUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICING[model];
  if (!price) return 0;
  return (inputTokens / 1_000_000) * price.inPerM + (outputTokens / 1_000_000) * price.outPerM;
}

/** Per-run cost ceiling (USD) from `ORCHID_AUDIT_MAX_USD`, default $0.50. */
function auditMaxUsd(): number {
  const raw = Number(process.env.ORCHID_AUDIT_MAX_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 0.5;
}

const clampScore = (score: number): number => Math.max(0, Math.min(100, Math.round(score)));

/** Assemble the user prompt: the rule-based hook drift, any omitted files, then each config file. */
export function buildContent(
  repo: Repo,
  files: AuditFile[],
  hookStates: { path: string; status: string }[],
  omitted: string[],
): string {
  const parts = [`Repository: ${repo.nameWithOwner} (default branch ${repo.defaultBranch}).`];
  if (hookStates.length > 0) {
    parts.push(
      `Rule-based hook drift vs the canonical template:\n${hookStates
        .map((h) => `- ${h.path}: ${h.status}`)
        .join("\n")}`,
    );
  }
  if (omitted.length > 0) {
    parts.push(`Omitted for size (not reviewed): ${omitted.join(", ")}`);
  }
  parts.push("Config files follow, each delimited by a FILE marker:");
  for (const file of files) {
    parts.push(`===== FILE: ${file.path} =====\n${file.content}`);
  }
  return parts.join("\n\n");
}

const toFindingRow = (f: AuditFindingResult) => ({
  title: f.title,
  severity: f.severity,
  category: f.category,
  file: f.file,
  lineHint: f.lineHint,
  evidence: f.evidence,
  rationale: f.rationale,
  recommendation: f.recommendation,
  autoFixable: f.autoFixable,
  proposedPatch: f.proposedPatch,
});

/** Run one audit (the `audit:run` worker task): collect the repo's config, enforce the cost cap via
 *  a free token preflight, call the provider with structured output, drop hallucinated findings, and
 *  persist the result. Any failure is recorded on the audit row (status `failed`) — never thrown to
 *  the worker, so a bad run can't crash the queue. */
export async function runAudit(auditId: string): Promise<void> {
  // Atomically claim the row (pending → running) so a duplicate/retried job can't double-process it.
  const claim = await prisma.repoAudit.updateMany({
    where: { id: auditId, status: "pending" },
    data: { status: "running" },
  });
  if (claim.count === 0) return; // already claimed/processed, or the row is gone

  try {
    // Lookup is inside the guarded path so a transient DB error is recorded as failed, not thrown.
    const audit = await prisma.repoAudit.findUnique({
      where: { id: auditId },
      include: { repo: true },
    });
    if (!audit) return;

    // Fail closed if we can't price the model — otherwise estimateUsd would return 0 and the cost
    // guard below would wave through an unbounded run.
    if (!MODEL_PRICING[audit.model]) {
      throw new Error(`No pricing configured for model ${audit.model} — cannot enforce the cost cap.`);
    }

    const apiKey = await getDecryptedProviderKey("anthropic");
    if (!apiKey) throw new Error("No Anthropic key configured.");

    const { files, commitSha, omitted, truncated } = await collectAuditContext(audit.repo);
    if (truncated) {
      throw new Error("Repository tree is too large (truncated) — cannot guarantee a complete audit.");
    }
    if (files.length === 0) throw new Error("No agent/hook config files found to audit.");

    const hookStates = await prisma.repoHookState.findMany({
      where: { repoId: audit.repoId },
      select: { path: true, status: true },
    });
    const content = buildContent(audit.repo, files, hookStates, omitted);

    // Cost guard: free token preflight × price, refuse if it would exceed the per-run cap.
    const preflightTokens = await countInputTokens(apiKey, audit.model, SYSTEM_PROMPT, content);
    const estimate = estimateUsd(audit.model, preflightTokens, AUDIT_MAX_OUTPUT_TOKENS);
    const cap = auditMaxUsd();
    if (estimate > cap) {
      throw new Error(
        `Estimated cost $${estimate.toFixed(2)} exceeds the per-run cap $${cap.toFixed(2)} — raise ORCHID_AUDIT_MAX_USD or use a cheaper model.`,
      );
    }

    const { result, inputTokens, outputTokens } = await runAuditMessage(
      apiKey,
      audit.model,
      SYSTEM_PROMPT,
      content,
      AUDIT_MAX_OUTPUT_TOKENS,
    );
    const auditedFiles = new Set(files.map((f) => f.path));
    const findings = validateFindings(result.findings, auditedFiles);
    if (findings.length < result.findings.length) {
      console.warn(
        `audit ${auditId}: dropped ${result.findings.length - findings.length} invalid/hallucinated finding(s)`,
      );
    }
    // Fall back to the preflight count / budgeted max if the response omits usage, so a completed
    // run never records a misleading $0 / 0-token cost.
    const usedInput = inputTokens || preflightTokens;
    const usedOutput = outputTokens || AUDIT_MAX_OUTPUT_TOKENS;

    await prisma.repoAudit.update({
      where: { id: auditId },
      data: {
        status: "completed",
        commitSha,
        score: clampScore(result.summary.score),
        summary: result.summary.overallAssessment,
        inputTokens: usedInput,
        outputTokens: usedOutput,
        estimatedUsd: estimateUsd(audit.model, usedInput, usedOutput),
        completedAt: new Date(),
        findings: { create: findings.map(toFindingRow) },
      },
    });
  } catch (error) {
    await prisma.repoAudit
      .update({
        where: { id: auditId },
        data: { status: "failed", error: briefError(error).message, completedAt: new Date() },
      })
      .catch(() => {});
  }
}
