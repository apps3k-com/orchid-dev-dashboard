/** Parse workflow-control admins from a small, explicit OAuth-login allowlist. */
export function parseWorkflowAdmins(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Empty configuration deliberately grants no workflow-control privileges. */
export function isWorkflowAdmin(login: string): boolean {
  return parseWorkflowAdmins(process.env.ORCHID_WORKFLOW_ADMINS).has(login.toLowerCase());
}
