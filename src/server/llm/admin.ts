/** Parse the LLM-admin allowlist (env `ORCHID_LLM_ADMINS`, comma-separated GitHub logins) into a
 *  lowercase set. Pure + unit-tested; exported so the env parsing can be tested without globals. */
export function parseLlmAdmins(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Whether a GitHub login may manage BYOK provider keys and run audits (the "LLM admin" role).
 *  Role assignment is env-based in v1 (`ORCHID_LLM_ADMINS`); an empty/unset list means nobody is an
 *  admin, so key management is locked down until an operator configures it. */
export function isLlmAdmin(login: string): boolean {
  return parseLlmAdmins(process.env.ORCHID_LLM_ADMINS).has(login.toLowerCase());
}
