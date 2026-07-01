import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src/app/(app)/audits");

/** Extract every module specifier imported by a source file (both `import ... from "x"`
 *  and side-effect `import "x"` forms). */
function importSpecifiers(src: string): string[] {
  return Array.from(src.matchAll(/import[^"']*["']([^"']+)["']/g)).map((m) => m[1]);
}

/** Whether `spec` is an allowed UI import for `/audits` files: shadcn/ui primitives, the
 *  shared DataTable, shadcnstudio blocks, or lucide-react icons. Non-UI imports (react, next,
 *  `@/server/*`, `@/lib/*`, `@/hooks/*`, relative `./`/`../`) are out of scope for this check. */
function isAllowedUiImport(spec: string): boolean {
  if (spec === "lucide-react") return true;
  if (spec.startsWith("@/components/")) {
    return (
      spec.startsWith("@/components/ui/") ||
      spec === "@/components/data-table" ||
      spec.startsWith("@/components/shadcn-studio/")
    );
  }
  return true;
}

describe("/audits UI imports stay within shadcn/ui + shadcnstudio", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));
  it("has table/page files", () => expect(files.length).toBeGreaterThan(0));
  for (const file of files) {
    it(`${file} imports UI only from ui/*, data-table, shadcn-studio/*, lucide (no other @/components, no recharts/css)`, () => {
      const specs = importSpecifiers(readFileSync(join(DIR, file), "utf8"));
      for (const spec of specs) {
        expect(spec).not.toBe("recharts");
        expect(spec.endsWith(".css")).toBe(false);
        expect(isAllowedUiImport(spec), `${file}: disallowed UI import ${spec}`).toBe(true);
      }
    });
  }
});
