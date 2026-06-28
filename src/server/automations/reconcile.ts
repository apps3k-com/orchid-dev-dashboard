import { getRecipe, parseManagedVersion } from "@/server/automations/recipes";
import { prisma } from "@/server/db";
import { isNotFound } from "@/server/github/errors";
import { repoClient } from "@/server/github/writeback";

/** Reconcile tracked automation installs against their repos. For each install, read the recipe's
 *  workflow file(s) on the default branch and set the state:
 *   - "installed"  — file present and its managed-header version matches the recipe version;
 *   - "outdated"   — file present but the merged version is behind the recipe (PR pending or drift);
 *   - "missing"    — a previously-installed file is gone (drift);
 *   - "pending_pr" — never installed and the file isn't there yet.
 *  Returns the number of state changes. Transient/repo errors leave the row unchanged. */
export async function reconcileAutomations(): Promise<number> {
  const installs = await prisma.automationInstall.findMany({ include: { repo: true } });
  let changed = 0;

  for (const install of installs) {
    const recipe = getRecipe(install.recipeId);
    if (!recipe) continue;

    let present: boolean;
    let installedVersion: number | null = null;
    try {
      const { octokit, owner, name, base } = await repoClient(install.repo);
      present = true;
      for (const file of recipe.render()) {
        try {
          const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo: name,
            path: file.path,
            ref: base,
          });
          if (Array.isArray(res.data) || res.data.type !== "file") {
            present = false;
            break;
          }
          const version = parseManagedVersion(Buffer.from(res.data.content, "base64").toString("utf8"));
          if (version !== null) installedVersion = version;
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

    const wasInstalled = install.state === "installed" || install.state === "outdated";
    const state = !present
      ? wasInstalled
        ? "missing"
        : "pending_pr"
      : installedVersion === recipe.version
        ? "installed"
        : "outdated";

    if (state !== install.state) {
      await prisma.automationInstall.update({ where: { id: install.id }, data: { state } });
      changed += 1;
    }
  }

  return changed;
}
