/** True when an Octokit error carries an HTTP 404 status (resource does not exist). */
export function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 404
  );
}
