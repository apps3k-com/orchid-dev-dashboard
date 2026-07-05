"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isOrgMember } from "@/server/github/activation";
import { fetchRepoHookBlob, fetchTemplateHookBlobs, isAcknowledged } from "@/server/github/hooks";
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

  // Authorization: repoId is client-supplied, so gate the PR to members of the target repo's org
  // (signed-in alone is not enough — a member of one managed org must not target another's repo).
  const org = await prisma.org.findUnique({ where: { id: repo.orgId } });
  if (!org) return { ok: false, message: "Organization not found." };
  try {
    if (!(await isOrgMember(org, user.login))) {
      return { ok: false, message: `You are not a member of ${org.login}.` };
    }
  } catch (error) {
    console.warn("resyncRepoHooks membership check failed", briefError(error));
    return { ok: false, message: "Could not verify your organization membership — please try again." };
  }

  // Skip files whose drift the user confirmed as an intentional customization — re-syncing them would
  // undo the customization.
  const drift = (
    await prisma.repoHookState.findMany({
      where: { repoId, status: { in: ["outdated", "missing"] }, templateSha: { not: null } },
      orderBy: { path: "asc" },
    })
  ).filter((d) => !isAcknowledged(d));
  const targets = drift.flatMap((d) =>
    d.templateSha ? [{ path: d.path, templateSha: d.templateSha }] : [],
  );
  if (targets.length === 0) {
    return { ok: false, message: "Nothing to re-sync — no unconfirmed outdated or missing files." };
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

/** The template-vs-repo content of a hook file, for the drift diff (null when unavailable). */
export type HookDiffResult = { status: string; templateText: string; repoText: string } | null;

/** Server action: load a hook file's template + repo content so the drift can be rendered as a diff.
 *  Read-only + signed-in gated; returns null if the state is gone or GitHub is unreachable. */
export async function getHookDiff(repoId: string, path: string): Promise<HookDiffResult> {
  const user = await getSessionUser();
  if (!user) return null;
  const state = await prisma.repoHookState.findUnique({
    where: { repoId_path: { repoId, path } },
    include: { repo: { include: { org: true } } },
  });
  if (!state) return null;
  try {
    const [templateFiles, repoText] = await Promise.all([
      state.templateSha
        ? fetchTemplateHookBlobs([{ path, templateSha: state.templateSha }])
        : Promise.resolve([]),
      fetchRepoHookBlob(state.repo, state.repoSha),
    ]);
    return { status: state.status, templateText: templateFiles[0]?.content ?? "", repoText };
  } catch (error) {
    console.warn("getHookDiff failed", briefError(error));
    return null;
  }
}

/** Server action: confirm a file's drift as an intentional repo-specific customization, tied to the
 *  current SHA pair so any later change re-flags it. Signed-in gated. */
export async function acknowledgeHookDrift(
  repoId: string,
  path: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const state = await prisma.repoHookState.findUnique({ where: { repoId_path: { repoId, path } } });
  if (!state) return { ok: false, message: "Hook file not found." };
  await prisma.repoHookState.update({
    where: { repoId_path: { repoId, path } },
    data: {
      acknowledgedRepoSha: state.repoSha,
      acknowledgedTemplateSha: state.templateSha,
      acknowledgedBy: user.login,
      acknowledgedAt: new Date(),
    },
  });
  revalidatePath(`/hooks/${repoId}`);
  return { ok: true, message: "Marked as a confirmed customization." };
}

/** Server action: clear a file's confirmation so its drift is flagged again. Signed-in gated. */
export async function unacknowledgeHookDrift(
  repoId: string,
  path: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  await prisma.repoHookState.updateMany({
    where: { repoId, path },
    data: {
      acknowledgedRepoSha: null,
      acknowledgedTemplateSha: null,
      acknowledgedBy: null,
      acknowledgedAt: null,
    },
  });
  revalidatePath(`/hooks/${repoId}`);
  return { ok: true, message: "Drift is flagged again." };
}
