import { getRecipe } from "@/server/automations/recipes";
import { prisma } from "@/server/db";
import { isNotFound } from "@/server/github/errors";
import { repoClient } from "@/server/github/writeback";

/** Reconcile tracked automation installs against their repos: mark each "installed" once the
 *  recipe's workflow file(s) exist on the default branch, "missing" if a previously-installed
 *  file is gone (drift), otherwise leave it "pending_pr". Returns the number of state changes.
 *  Transient/repo errors leave the row unchanged. */
export async function reconcileAutomations(): Promise<number> {
  const installs = await prisma.automationInstall.findMany({ include: { repo: true } });
  let changed = 0;

  for (const install of installs) {
    const recipe = getRecipe(install.recipeId);
    if (!recipe) continue;

    let present: boolean;
    try {
      const { octokit, owner, name, base } = await repoClient(install.repo);
      present = true;
      for (const file of recipe.render()) {
        try {
          await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo: name,
            path: file.path,
            ref: base,
          });
        } catch (error) {
          if (isNotFound(error)) {
            present = false;
            break;
          }
          throw error;
        }
      }
    } catch {
      continue; // transient/repo error — leave the state unchanged this run
    }

    const state = present ? "installed" : install.state === "installed" ? "missing" : "pending_pr";
    if (state !== install.state) {
      await prisma.automationInstall.update({ where: { id: install.id }, data: { state } });
      changed += 1;
    }
  }

  return changed;
}
