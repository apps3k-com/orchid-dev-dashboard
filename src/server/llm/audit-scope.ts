// The agent/hook configuration surface an audit reads and reasons about — pure path predicates,
// shared by the collector (context.ts) and the findings validator (audit-schema.ts) so both agree
// on exactly which paths are in scope.

export const AUDIT_ROOT_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CODEX.md",
  ".coderabbit.yaml",
  ".coderabbit.yml",
]);

export const AUDIT_PREFIXES = [".claude/", ".codex/", ".github/workflows/", "docs/agents/"];

/** Whether a repo path is within the agent/hook config surface an audit covers. */
export function isAuditPath(path: string): boolean {
  return AUDIT_ROOT_FILES.has(path) || AUDIT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Collection priority for a path (root files first, then the prefixes in order). */
export function auditPathPriority(path: string): number {
  if (AUDIT_ROOT_FILES.has(path)) return 0;
  const index = AUDIT_PREFIXES.findIndex((prefix) => path.startsWith(prefix));
  return index === -1 ? 99 : index + 1;
}
