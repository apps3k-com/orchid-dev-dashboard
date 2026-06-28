/** True when an Octokit error carries the given HTTP status. */
function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === status
  );
}

/** True when an Octokit error carries an HTTP 404 status (resource does not exist). */
export function isNotFound(error: unknown): boolean {
  return hasStatus(error, 404);
}

/** True when an Octokit error carries an HTTP 409 status (conflict — created concurrently). */
export function isConflict(error: unknown): boolean {
  return hasStatus(error, 409);
}
