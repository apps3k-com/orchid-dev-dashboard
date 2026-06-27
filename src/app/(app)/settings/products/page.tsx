import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductsForm } from "@/components/products-form";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { getOrgProducts } from "@/server/github/variables";

export const dynamic = "force-dynamic";

/** Per-organization editor for the PRODUCTS taxonomy (the org Actions variable that powers
 *  cross-repo product boards). The only sanctioned direct write to GitHub config. */
export default async function ProductsSettingsPage() {
  await requireUser();
  const orgs = await prisma.org.findMany({ orderBy: { login: "asc" } });
  const rows = await Promise.all(
    orgs.map(async (org) => ({
      org,
      products: await getOrgProducts(org).catch(() => null),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          Per-organization product taxonomy — the <code>PRODUCTS</code> org variable used for
          cross-repo boards. Saved directly to GitHub.
        </p>
      </div>

      {orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No managed organizations yet — install the GitHub App from{" "}
          <a className="underline" href="/setup">
            setup
          </a>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ org, products }) => (
            <Card key={org.id}>
              <CardHeader>
                <CardTitle>{org.login}</CardTitle>
                <CardDescription>
                  {products === null
                    ? "Could not read the current products."
                    : `${products.length} product${products.length === 1 ? "" : "s"}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {products === null ? (
                  <p className="text-sm text-destructive">
                    Could not reach GitHub to read the PRODUCTS variable. Try refreshing.
                  </p>
                ) : (
                  <ProductsForm orgId={org.id} products={products} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
