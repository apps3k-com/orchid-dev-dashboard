/**
 * Build the GitHub App manifest that the /setup flow POSTs to GitHub to create the
 * App in one click. See https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.
 *
 * Permissions cover what Orchid needs to read repos/PRs/Projects and to write modules
 * (Contents → PR) and automations. `checks` + `statuses` (read) are required for the PR board's
 * check-rollup state (GraphQL `statusCheckRollup`). Both repo- and org-level Actions Variables are included
 * (`actions_variables` / `organization_actions_variables`) — the org one is required to write the
 * org-wide PRODUCTS variable. Keys verified against a live App's granted permissions object.
 *
 * `default_events` + `hook_attributes.url` feed the event spine (`/api/ingest/github`): apps
 * created BEFORE this list grew must enable the additional events manually in the App settings
 * (documented in docs/wiki/GitHub-App-Setup.md).
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
    hook_attributes: { url: `${appUrl}/api/ingest/github`, active: true },
    default_permissions: {
      contents: "write",
      issues: "write",
      pull_requests: "write",
      checks: "read",
      statuses: "read",
      members: "read",
      metadata: "read",
      organization_projects: "write",
      actions_variables: "write",
      organization_actions_variables: "write",
      organization_secrets: "write",
    },
    default_events: [
      "issues",
      "pull_request",
      "check_suite",
      "deployment_status",
      "release",
      "projects_v2_item",
    ],
  } as const;
}
