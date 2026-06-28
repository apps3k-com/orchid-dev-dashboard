"use server";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { fetchTemplateHookBlobs } from "@/server/github/hooks";
import { proposeFiles } from "@/server/github/writeback";
import { briefError } from "@/server/log";

/** Result of {@link resyncRepoHooks}, surfaced inline in the re-sync form (with the new PR URL). */
export type ResyncState = { ok: boolean; message: string; prUrl?: string };

/** Server action: open a PR that brings a repo's drifted agent-hook files (outdated/missing vs the
 *  canonical template) back in line by writing the template's version of each. `extra` files
 *  (repo-specific additions) are left untouched. Auth-gated; write-back is PR-only. */
export async function resyncRepoHooks(
  _prev: ResyncState,
  formData: FormData,
): Promise<ResyncState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const repoId = String(formData.get("repoId") ?? "");
  if (!repoId) return { ok: false, message: "Missing repository." };

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  const drift = await prisma.repoHookState.findMany({
    where: { repoId, status: { in: ["outdated", "missing"] }, templateSha: { not: null } },
    orderBy: { path: "asc" },
  });
  const targets = drift.flatMap((d) =>
    d.templateSha ? [{ path: d.path, templateSha: d.templateSha }] : [],
  );
  if (targets.length === 0) {
    return { ok: false, message: "Nothing to re-sync — no outdated or missing files." };
  }

  try {
    const files = await fetchTemplateHookBlobs(targets);
    const { prUrl } = await proposeFiles(repo, files, {
      branchPrefix: "orchid/sync-hooks",
      commitMessage: "chore(hooks): sync agent hooks with the canonical template",
      title: "chore(hooks): sync agent hooks with the canonical template",
      body:
        `Re-syncs ${files.length} agent-hook file(s) to match the canonical template ` +
        `(\`${process.env.ORCHID_TEMPLATE_REPO}\`), opened via Orchid.\n\n` +
        files.map((f) => `- \`${f.path}\``).join("\n"),
    });
    return { ok: true, message: `Opened a pull request re-syncing ${files.length} file(s).`, prUrl };
  } catch (error) {
    console.warn("resyncRepoHooks failed", briefError(error));
    return { ok: false, message: "Could not open the re-sync pull request — please try again." };
  }
}
