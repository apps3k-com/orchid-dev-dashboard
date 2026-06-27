"use server";

import { getRecipe } from "@/server/automations/recipes";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { setOrgAppCredentials, setRepoConfig } from "@/server/github/activation";
import { proposeFiles } from "@/server/github/writeback";

/** Result of {@link installRecipe}, surfaced inline in the install form (with the new PR URL). */
export type InstallState = { ok: boolean; message: string; prUrl?: string };

const isForbidden = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { status?: number }).status === 403;

/** Server action: provision an automation recipe into a repo. Sets the org-level App credentials
 *  and the recipe's per-repo config variables, then opens a PR adding the workflow. Auth-gated. */
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
    const value = String(formData.get(`input.${input.name}`) ?? "").trim();
    if (!value) return { ok: false, message: `Missing ${input.label}.` };
    config[input.name] = value;
  }

  const org = await prisma.org.findUnique({ where: { id: repo.orgId } });
  if (!org) return { ok: false, message: "Organization not found." };

  try {
    await setOrgAppCredentials(org);
    await setRepoConfig(repo, config);
    const { prUrl } = await proposeFiles(repo, recipe.render(), {
      branchPrefix: `orchid/automation-${recipe.id}`,
      commitMessage: `ci(automation): add ${recipe.id} workflow`,
      title: `ci(automation): add ${recipe.name}`,
      body:
        `Provisions the **${recipe.name}** automation via Orchid.\n\n${recipe.description}\n\n` +
        "Orchid has set the org App credentials and the repo variables " +
        `${Object.keys(config).map((k) => `\`${k}\``).join(", ")}, so the workflow activates on merge.`,
    });
    return { ok: true, message: "Opened a pull request with the automation workflow.", prUrl };
  } catch (error) {
    console.error("installRecipe failed", error);
    if (isForbidden(error)) {
      return {
        ok: false,
        message:
          "Permission denied — the GitHub App likely needs the organization variables/secrets permission. Re-approve it on the org's installation, then retry.",
      };
    }
    return { ok: false, message: "Could not provision — please try again." };
  }
}
