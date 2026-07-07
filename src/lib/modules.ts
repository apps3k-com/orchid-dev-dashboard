/** A module's Orchid metadata (the subset of the Prisma `Module` used to build a table row). */
export type ModuleMeta = { name: string; description: string; status: string };

/** One /modules table row: yaml name + metadata + count of issues carrying its `module:*` label. */
export type ModuleRowData = {
  name: string;
  description: string;
  status: string;
  assignedIssues: number;
};

/** Build the /modules rows: join the `.github/modules.yaml` names (the canonical set) with their
 *  Orchid metadata and the count of cached issues carrying each module's `module:<name>` label.
 *  Names without metadata default to an empty description + "active". Pure. */
export function buildModuleRows(
  names: string[],
  metadata: ModuleMeta[],
  issueLabels: string[][],
): ModuleRowData[] {
  const metaByName = new Map(metadata.map((m) => [m.name, m]));
  return names.map((name) => {
    const meta = metaByName.get(name);
    const label = `module:${name}`;
    return {
      name,
      description: meta?.description ?? "",
      status: meta?.status ?? "active",
      assignedIssues: issueLabels.filter((labels) => labels.includes(label)).length,
    };
  });
}
