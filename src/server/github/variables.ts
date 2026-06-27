import type { Org } from "@prisma/client";
import { getInstallationOctokit } from "@/server/github/app";

/** Name of the org-level Actions variable that holds the product taxonomy. */
export const PRODUCTS_VARIABLE = "PRODUCTS";

/** Parse a PRODUCTS variable value (comma-separated) into a clean, deduped list (pure). */
export function parseProducts(value: string): string[] {
  return [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean))];
}

/** Serialize a product list back to the comma-separated PRODUCTS variable value (pure). */
export function formatProducts(products: string[]): string {
  return [...new Set(products.map((s) => s.trim()).filter(Boolean))].join(",");
}

/** True when an Octokit error is a 404 (resource does not exist). */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 404
  );
}

/** Read the org's PRODUCTS variable (empty list if unset). Requires the org installation. */
export async function getOrgProducts(org: Org): Promise<string[]> {
  if (!org.installationId) return [];
  const octokit = await getInstallationOctokit(org.installationId);
  try {
    const res = await octokit.request("GET /orgs/{org}/actions/variables/{name}", {
      org: org.login,
      name: PRODUCTS_VARIABLE,
    });
    return parseProducts(res.data.value);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

/** Write the org's PRODUCTS variable (create if missing, otherwise update). This is the one
 *  sanctioned direct write to GitHub config — every repo-file change goes via PR instead. */
export async function setOrgProducts(org: Org, products: string[]): Promise<void> {
  if (!org.installationId) throw new Error(`Org ${org.login} has no installation.`);
  const octokit = await getInstallationOctokit(org.installationId);
  const value = formatProducts(products);
  try {
    await octokit.request("PATCH /orgs/{org}/actions/variables/{name}", {
      org: org.login,
      name: PRODUCTS_VARIABLE,
      value,
    });
  } catch (error) {
    if (isNotFound(error)) {
      await octokit.request("POST /orgs/{org}/actions/variables", {
        org: org.login,
        name: PRODUCTS_VARIABLE,
        value,
        visibility: "all",
      });
    } else {
      throw error;
    }
  }
}
