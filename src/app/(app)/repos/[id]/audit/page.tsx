import type { AuditFinding } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditFixButton } from "@/components/audit-fix-button";
import { AuditRunForm } from "@/components/audit-run-form";
import { severityVariant, statusVariant } from "@/lib/audit-ui";
import { requireUser } from "@/server/auth/require";
import { isLlmAdmin } from "@/server/llm/admin";
import { getProviderKeySummaries } from "@/server/llm/keys";
import { PROVIDERS } from "@/server/llm/providers";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** One finding: severity + category badges, title, cited file, rationale, and recommendation. */
function FindingRow({ finding }: { finding: AuditFinding }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
        <Badge variant="outline">{finding.category}</Badge>
        <span className="font-medium">{finding.title}</span>
      </div>
      <code className="text-xs">
        {finding.file}
        {finding.lineHint ? `:${finding.lineHint}` : ""}
      </code>
      <p className="text-muted-foreground">{finding.rationale}</p>
      <p>
        <span className="font-medium">Fix:</span> {finding.recommendation}
      </p>
      {finding.autoFixable && finding.proposedPatch != null && finding.category !== "missing" ? (
        <AuditFixButton
          findingId={finding.id}
          findingState={finding.state}
          prUrl={finding.prUrl}
        />
      ) : null}
    </div>
  );
}

/** Per-repo LLM audit of the agent/hook config: run a new audit (admin + valid key) and read the
 *  latest run's findings. Read-only here — applying a fix as a PR is a later phase. */
export default async function RepoAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const admin = isLlmAdmin(user.login);
  const { id } = await params;

  const repo = await prisma.repo.findUnique({
    where: { id },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { findings: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!repo) notFound();

  const audit = repo.audits[0] ?? null;
  const anthropic = (await getProviderKeySummaries()).find((s) => s.provider === "anthropic");
  const keyReady = Boolean(
    anthropic?.configured && (anthropic.status === "valid" || anthropic.status === "rate_limited"),
  );
  const model = anthropic?.selectedModel ?? PROVIDERS.anthropic.defaultModel;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/repos" className="text-sm text-muted-foreground hover:underline">
          ← Repositories
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{repo.nameWithOwner}</h1>
        <p className="text-sm text-muted-foreground">
          LLM audit of this repo&apos;s agent &amp; hook config (<code>.claude/</code>,{" "}
          <code>.codex/</code>, <code>AGENTS.md</code>/<code>CLAUDE.md</code>/<code>CODEX.md</code>,{" "}
          <code>.coderabbit.yaml</code>, <code>docs/agents/*</code>, and GitHub Actions workflows)
          for redundancies, misconfigurations and optimizations. Findings are advisory.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run an audit</CardTitle>
          <CardDescription>Uses the instance Anthropic key ({model}).</CardDescription>
        </CardHeader>
        <CardContent>
          {!admin ? (
            <p className="text-sm text-muted-foreground">Only an LLM admin can run audits.</p>
          ) : !keyReady ? (
            <p className="text-sm text-muted-foreground">
              Configure a valid Anthropic key in{" "}
              <Link href="/settings/ai-providers" className="underline">
                Settings → AI providers
              </Link>{" "}
              first.
            </p>
          ) : (
            <AuditRunForm repoId={repo.id} model={model} />
          )}
        </CardContent>
      </Card>

      {audit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Latest audit</span>
              <Badge variant={statusVariant(audit.status)}>{audit.status}</Badge>
            </CardTitle>
            <CardDescription>
              {audit.model} · {audit.findings.length} finding
              {audit.findings.length === 1 ? "" : "s"}
              {audit.score != null ? ` · health ${audit.score}/100` : ""}
              {audit.estimatedUsd ? ` · ~$${Number(audit.estimatedUsd).toFixed(2)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {audit.status === "failed" && audit.error ? (
              <p className="text-sm text-destructive">{audit.error}</p>
            ) : null}
            {audit.status === "pending" || audit.status === "running" ? (
              <p className="text-sm text-muted-foreground">
                Audit {audit.status} — reload in a moment.
              </p>
            ) : null}
            {audit.summary ? <p className="text-sm text-muted-foreground">{audit.summary}</p> : null}
            {audit.findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
            {audit.status === "completed" && audit.findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No findings — the config looks clean.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No audit has been run yet.</p>
      )}
    </div>
  );
}
