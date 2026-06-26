"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProducts, type SaveProductsState } from "@/app/(app)/settings/products/actions";

const INITIAL: SaveProductsState = { ok: false, message: "" };

/** Per-org editor for the PRODUCTS taxonomy: shows current products as badges and submits a
 *  comma-separated list to the {@link saveProducts} server action. */
export function ProductsForm({ orgId, products }: { orgId: string; products: string[] }) {
  const [state, action, pending] = useActionState(saveProducts, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      {products.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {products.map((p) => (
            <Badge key={p} variant="secondary">
              {p}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No products yet.</p>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <div className="flex gap-2">
        <Input
          name="products"
          defaultValue={products.join(", ")}
          placeholder="checkout, billing, fulfilment"
          aria-label="Products (comma-separated)"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.message ? (
        <p className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
