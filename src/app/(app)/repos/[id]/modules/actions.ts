"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { proposeModules } from "@/server/github/modules";

/** Result of {@link saveModules}, surfaced inline in the editor form (with the new PR URL). */
export type SaveModulesState = { ok: boolean; message: string; prUrl?: string };

const NO_CHANGES = "No changes to the module list.";

const schema = z.object({
  repoId: z.string().min(1),
  modules: z.string(),
});

/** Server action: propose a module-list change for a repo as a pull request. Auth-gated; parses
 *  the comma-separated input and delegates to {@link proposeModules}. Never leaks raw errors. */
export async function saveModules(
  _prev: SaveModulesState,
  formData: FormData,
): Promise<SaveModulesState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const parsed = schema.safeParse({
    repoId: formData.get("repoId"),
    modules: formData.get("modules"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  const repo = await prisma.repo.findUnique({ where: { id: parsed.data.repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  const modules = parsed.data.modules.split(",").map((m) => m.trim()).filter(Boolean);
  try {
    const { prUrl } = await proposeModules(repo, modules);
    revalidatePath(`/repos/${repo.id}/modules`);
    return { ok: true, message: "Opened a pull request with the module changes.", prUrl };
  } catch (error) {
    if (error instanceof Error && error.message === NO_CHANGES) {
      return { ok: false, message: NO_CHANGES };
    }
    console.error("saveModules failed", error);
    return { ok: false, message: "Could not open the pull request — please try again." };
  }
}
