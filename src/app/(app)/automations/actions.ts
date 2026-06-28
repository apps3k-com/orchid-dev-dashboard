"use server";

import { getRecipe } from "@/server/automations/recipes";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isOrgMember, setOrgAppCredentials, setRepoConfig } from "@/server/github/activation";
import { proposeFiles } from "@/server/github/writeback";
import { briefError } from "@/server/log";

/** Result of {@link installRecipe}, surfaced inline in the install form (with the new PR URL). */
export type InstallState = { ok: boolean; message: string; prUrl?: string };

const isForbidden = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { status?: number }).status === 403;

/** Server action: provision an automation recipe into a repo. Gated to members of the target org
 *  (it writes an org secret); sets the org App credentials + per-repo config, then opens a PR. */
export async function installRecipe(
  _prev: InstallState,
  formData: FormData,
): Promise<InstallState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const recipeId = String(formData.get("recipeId") ?? "");
  const repoId = String(formData.get("repoId") ?? "");
  if (!recipeId || !repoId) return { ok: false, message: "Pick a repository first." };

  const recipe = getRecipe(recipeId);
  if (!recipe) return { ok: false, message: "Unknown recipe." };

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  const config: Record<string, string> = {};
  for (const input of recipe.inputs) {
    const raw = formData.get(`input.${input.name}`);
    const value = (typeof raw === "string" ? raw : "").trim();
    if (!value) return { ok: false, message: `Missing ${input.label}.` };
    if (input.type === "url" && !URL.canParse(value)) {
      return { ok: false, message: `${input.label} must be a valid URL.` };
    }
    if (input.pattern && !new RegExp(input.pattern).test(value)) {
      return { ok: false, message: `${input.label} is not in the expected format.` };
    }
    config[input.name] = value;
  }

  const org = await prisma.org.findUnique({ where: { id: repo.orgId } });
  if (!org) return { ok: false, message: "Organization not found." };

  // Provisioning writes an org secret (the App key) — gate it to members of that org.
  try {
    if (!(await isOrgMember(org, user.login))) {
      return { ok: false, message: `You are not a member of ${org.login}.` };
    }
    await setOrgAppCredentials(org, repo);
    await setRepoConfig(repo, config);
  } catch (error) {
    console.error("installRecipe activation failed", briefError(error));
    if (isForbidden(error)) {
      return {
        ok: false,
        message:
          "Permission denied — the GitHub App likely needs the organization variables/secrets permission. Re-approve it on the org's installation, then retry.",
      };
    }
    return { ok: false, message: "Could not set credentials — please try again." };
  }

  let prUrl: string;
  try {
    ({ prUrl } = await proposeFiles(repo, recipe.render(), {
      branchPrefix: `orchid/automation-${recipe.id}`,
      commitMessage: `ci(automation): add ${recipe.id} workflow`,
      title: `ci(automation): add ${recipe.name}`,
      body:
        `Provisions the **${recipe.name}** automation via Orchid.\n\n${recipe.description}\n\n` +
        "Orchid has set the org App credentials and the repo variables " +
        `${Object.keys(config).map((k) => `\`${k}\``).join(", ")}, so the workflow activates on merge.`,
    }));
  } catch (error) {
    console.error("installRecipe PR failed", briefError(error));
    return {
      ok: false,
      message: "Credentials set, but the pull request could not be opened — check branch protection and retry.",
    };
  }

  // The PR is open (the user-facing outcome); a tracking-row failure must not report PR failure.
  try {
    await prisma.automationInstall.upsert({
      where: { repoId_recipeId: { repoId: repo.id, recipeId: recipe.id } },
      create: { repoId: repo.id, recipeId: recipe.id, version: recipe.version, state: "pending_pr", prUrl },
      update: { version: recipe.version, state: "pending_pr", prUrl },
    });
  } catch (error) {
    console.error("installRecipe tracking failed", briefError(error));
  }
  return { ok: true, message: "Opened a pull request with the automation workflow.", prUrl };
}
