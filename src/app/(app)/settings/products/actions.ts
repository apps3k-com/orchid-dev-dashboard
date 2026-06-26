"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { parseProducts, setOrgProducts } from "@/server/github/variables";

/** Result of {@link saveProducts}, surfaced inline in the editor form. */
export type SaveProductsState = { ok: boolean; message: string };

const schema = z.object({
  orgId: z.string().min(1),
  products: z.string(),
});

/** Server action: persist the edited product list to an org's PRODUCTS variable. Auth-gated to
 *  a signed-in user; validates input, writes via {@link setOrgProducts}, and revalidates the page. */
export async function saveProducts(
  _prev: SaveProductsState,
  formData: FormData,
): Promise<SaveProductsState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const parsed = schema.safeParse({
    orgId: formData.get("orgId"),
    products: formData.get("products"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  const org = await prisma.org.findUnique({ where: { id: parsed.data.orgId } });
  if (!org) return { ok: false, message: "Organization not found." };

  const products = parseProducts(parsed.data.products);
  try {
    await setOrgProducts(org, products);
  } catch (error) {
    return { ok: false, message: `Could not save: ${String(error)}` };
  }

  revalidatePath("/settings/products");
  return {
    ok: true,
    message: `Saved ${products.length} product${products.length === 1 ? "" : "s"} for ${org.login}.`,
  };
}
