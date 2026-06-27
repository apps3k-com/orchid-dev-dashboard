import yaml from "js-yaml";

const HEADER =
  "# Modules for this repository — managed by Orchid.\n" +
  "# Edit via the Orchid module editor; changes land on the default branch via PR.\n";

/** Parse a `.github/modules.yaml` document into a clean, deduped list of module names (pure).
 *  Tolerates a missing/empty `modules:` key and invalid YAML (returns []). */
export function parseModulesYaml(text: string): string[] {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch {
    return [];
  }
  const modules =
    doc && typeof doc === "object" && "modules" in doc
      ? (doc as { modules?: unknown }).modules
      : undefined;
  if (!Array.isArray(modules)) return [];
  return [...new Set(modules.map((m) => String(m).trim()).filter(Boolean))];
}

/** Render a module list back to a clean `.github/modules.yaml` document (pure). */
export function renderModulesYaml(modules: string[]): string {
  const clean = [...new Set(modules.map((m) => m.trim()).filter(Boolean))];
  const body = clean.length > 0 ? yaml.dump({ modules: clean }, { lineWidth: -1 }) : "modules: []\n";
  return HEADER + body;
}
