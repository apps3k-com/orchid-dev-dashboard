/**
 * Build the GitHub App manifest that the /setup flow POSTs to GitHub to create the
 * App in one click. See https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.
 *
 * Permissions cover what Orchid needs to read repos/PRs/Projects and to write modules
 * (Contents → PR) and automations. The org-level Actions Variables permission (for the
 * PRODUCTS variable) is added with the Products editor increment.
 *
 * @param appUrl - The public base URL of this instance (e.g. https://orchid.example.com).
 * @param name - The App name to pre-fill (must be globally unique on GitHub).
 */
export function buildAppManifest(appUrl: string, name: string) {
  return {
    name,
    url: appUrl,
    redirect_url: `${appUrl}/setup/callback`,
    callback_urls: [`${appUrl}/api/auth/callback`],
    request_oauth_on_install: false,
    public: false,
    default_permissions: {
      contents: "write",
      issues: "write",
      pull_requests: "write",
      members: "read",
      metadata: "read",
      organization_projects: "write",
      variables: "write",
      organization_secrets: "write",
    },
    default_events: ["issues", "pull_request"],
  } as const;
}
