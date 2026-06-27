"use server";

import { z } from "zod";

import { getRecipe } from "@/server/automations/recipes";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { proposeFiles } from "@/server/github/writeback";

/** Result of {@link installRecipe}, surfaced inline in the install form (with the new PR URL). */
export type InstallState = { ok: boolean; message: string; prUrl?: string };

const schema = z.object({
  recipeId: z.string().min(1),
  repoId: z.string().min(1),
});

/** Server action: provision an automation recipe into a repo by opening a pull request that adds
 *  its (self-disabled) workflow file(s). Auth-gated; never leaks raw errors. */
export async function installRecipe(
  _prev: InstallState,
  formData: FormData,
): Promise<InstallState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const parsed = schema.safeParse({
    recipeId: formData.get("recipeId"),
    repoId: formData.get("repoId"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  const recipe = getRecipe(parsed.data.recipeId);
  if (!recipe) return { ok: false, message: "Unknown recipe." };

  const repo = await prisma.repo.findUnique({ where: { id: parsed.data.repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  try {
    const { prUrl } = await proposeFiles(repo, recipe.render(), {
      branchPrefix: `orchid/automation-${recipe.id}`,
      commitMessage: `ci(automation): add ${recipe.id} workflow`,
      title: `ci(automation): add ${recipe.name}`,
      body:
        `Provisions the **${recipe.name}** automation via Orchid.\n\n${recipe.description}\n\n` +
        `**Activate** by setting: ${recipe.activation.map((a) => `\`${a}\``).join(", ")}. ` +
        "The workflow self-disables until then.",
    });
    return { ok: true, message: "Opened a pull request with the automation workflow.", prUrl };
  } catch (error) {
    console.error("installRecipe failed", error);
    return { ok: false, message: "Could not open the pull request — please try again." };
  }
}
