/**
 * Build the GitHub App manifest that the /setup flow POSTs to GitHub to create the
 * App in one click. See https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.
 *
 * Permissions cover what Orchid needs to read repos/PRs/Projects and to write modules
 * (Contents → PR) and automations. Both repo- and org-level Actions Variables are included
 * (`actions_variables` / `organization_actions_variables`) — the org one is required to write the
 * org-wide PRODUCTS variable. Keys verified against a live App's granted permissions object.
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
      actions_variables: "write",
      organization_actions_variables: "write",
      organization_secrets: "write",
    },
    default_events: ["issues", "pull_request"],
  } as const;
}
