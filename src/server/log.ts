/** Reduce an error to a safe `{ message, status }` shape for server logs. Octokit errors carry a
 *  `request` field that can include the `Authorization` token, so never log the raw error object. */
export function briefError(error: unknown): { message: string; status?: number } {
  return {
    message: error instanceof Error ? error.message : String(error),
    status:
      typeof error === "object" && error !== null
        ? (error as { status?: number }).status
        : undefined,
  };
}
