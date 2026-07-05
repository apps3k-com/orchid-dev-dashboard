"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getRepoModules, proposeModules } from "@/server/github/modules";
import { briefError } from "@/server/log";

/** Result of a module action, surfaced inline in the form (with the new PR URL where relevant). */
export type ModuleActionState = { ok: boolean; message: string; prUrl?: string };

const NO_CHANGES = "No changes to the module list.";
const MODULE_STATUSES = ["active", "deprecated"] as const;

const metadataSchema = z.object({
  repoId: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional().default(""),
  status: z.enum(MODULE_STATUSES).optional().default("active"),
});

/** Add a module: store its Orchid metadata (description/status) immediately and open a PR adding the
 *  NAME to `.github/modules.yaml` (the name drives the repo's label/dropdown sync). */
export async function addModule(
  _prev: ModuleActionState,
  formData: FormData,
): Promise<ModuleActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const parsed = metadataSchema.safeParse({
    repoId: formData.get("repoId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "active",
  });
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  const { repoId, description, status } = parsed.data;
  const name = parsed.data.name.trim();
  if (!name) return { ok: false, message: "Module name is required." };

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  try {
    const current = await getRepoModules(repo);
    if (current.includes(name)) return { ok: false, message: `Module "${name}" already exists.` };
    // Metadata is keyed by repo+name and stored now; the name lands in the repo via the PR below.
    await prisma.module.upsert({
      where: { repoId_name: { repoId, name } },
      create: { repoId, name, description, status },
      update: { description, status },
    });
    const { prUrl } = await proposeModules(repo, [...current, name]);
    revalidatePath(`/repos/${repoId}/modules`);
    return { ok: true, message: `Saved metadata and opened a PR adding "${name}".`, prUrl };
  } catch (error) {
    if (error instanceof Error && error.message === NO_CHANGES) return { ok: false, message: NO_CHANGES };
    console.error("addModule failed", briefError(error));
    return { ok: false, message: "Could not add the module — please try again." };
  }
}

/** Update a module's Orchid metadata (description/status) — a direct DB write, no PR. */
export async function updateModuleMetadata(
  _prev: ModuleActionState,
  formData: FormData,
): Promise<ModuleActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const parsed = metadataSchema.safeParse({
    repoId: formData.get("repoId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "active",
  });
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  const { repoId, name, description, status } = parsed.data;

  try {
    await prisma.module.upsert({
      where: { repoId_name: { repoId, name } },
      create: { repoId, name, description, status },
      update: { description, status },
    });
    revalidatePath(`/repos/${repoId}/modules`);
    return { ok: true, message: "Module updated." };
  } catch (error) {
    console.error("updateModuleMetadata failed", briefError(error));
    return { ok: false, message: "Could not update the module — please try again." };
  }
}

/** Remove a module: open a PR removing the NAME from `.github/modules.yaml` + drop its metadata. */
export async function removeModule(repoId: string, name: string): Promise<ModuleActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  try {
    const current = await getRepoModules(repo);
    if (!current.includes(name)) return { ok: false, message: "Module not found in the list." };
    const { prUrl } = await proposeModules(
      repo,
      current.filter((m) => m !== name),
    );
    await prisma.module.deleteMany({ where: { repoId, name } });
    revalidatePath(`/repos/${repoId}/modules`);
    return { ok: true, message: `Opened a PR removing "${name}".`, prUrl };
  } catch (error) {
    if (error instanceof Error && error.message === NO_CHANGES) return { ok: false, message: NO_CHANGES };
    console.error("removeModule failed", briefError(error));
    return { ok: false, message: "Could not remove the module — please try again." };
  }
}
