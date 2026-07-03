import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src/app/(app)/audits");

/** Extract every module specifier imported by a source file (both `import ... from "x"`
 *  and side-effect `import "x"` forms). */
function importSpecifiers(src: string): string[] {
  return Array.from(src.matchAll(/import[^"']*["']([^"']+)["']/g)).map((m) => m[1]);
}

/** Whether `spec` is an allowed import for `/audits` files: shadcn/ui primitives, the shared
 *  DataTable, shadcnstudio blocks, or lucide-react icons are allowed; any other `@/components/*`
 *  path, `recharts`, and stylesheet (`.css`) imports are rejected. Non-UI imports (react, next,
 *  `@/server/*`, `@/lib/*`, `@/hooks/*`, relative `./`/`../`) are out of scope for this check and
 *  pass through — this guard only judges the UI-surface concerns above. */
export function isAllowedUiImport(spec: string): boolean {
  if (spec === "recharts") return false;
  if (spec.endsWith(".css")) return false;
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

describe("isAllowedUiImport decision logic", () => {
  it("rejects other @/components (not ui/*, data-table, or shadcn-studio/*)", () => {
    expect(isAllowedUiImport("@/components/audit-fix-button")).toBe(false);
  });
  it("rejects recharts", () => {
    expect(isAllowedUiImport("recharts")).toBe(false);
  });
  it("rejects stylesheet imports", () => {
    expect(isAllowedUiImport("something.css")).toBe(false);
  });
  it("accepts @/components/ui/* (shadcn/ui primitives)", () => {
    expect(isAllowedUiImport("@/components/ui/button")).toBe(true);
  });
  it("accepts the shared @/components/data-table", () => {
    expect(isAllowedUiImport("@/components/data-table")).toBe(true);
  });
  it("accepts @/components/shadcn-studio/* blocks", () => {
    expect(isAllowedUiImport("@/components/shadcn-studio/blocks/statistics-card-03")).toBe(true);
  });
  it("accepts lucide-react", () => {
    expect(isAllowedUiImport("lucide-react")).toBe(true);
  });
  it("accepts relative imports (e.g. ./actions) — out of scope for this check", () => {
    expect(isAllowedUiImport("./actions")).toBe(true);
  });
  it("accepts react (a non-@/components, non-UI package) — out of scope for this check", () => {
    expect(isAllowedUiImport("react")).toBe(true);
  });
});

describe("/audits UI imports stay within shadcn/ui + shadcnstudio", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));
  it("has table/page files", () => expect(files.length).toBeGreaterThan(0));
  for (const file of files) {
    it(`${file} imports UI only from ui/*, data-table, shadcn-studio/*, lucide (no other @/components, no recharts/css)`, () => {
      const specs = importSpecifiers(readFileSync(join(DIR, file), "utf8"));
      for (const spec of specs) {
        expect(isAllowedUiImport(spec), `${file}: disallowed UI import ${spec}`).toBe(true);
      }
    });
  }
});
