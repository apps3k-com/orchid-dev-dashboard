import type { ProposedFile } from "@/server/github/writeback";

/** A per-repo configuration value a recipe needs; collected at install and written as a repo
 *  Actions variable named exactly `name` (the workflow reads it via `vars.<name>`). */
export type RecipeInput = {
  name: string;
  label: string;
  placeholder?: string;
  description?: string;
  /** HTML input type + server-side validation hint (e.g. "url"). Defaults to text. */
  type?: string;
};

/** An automation recipe: a named bundle of workflow file(s) Orchid can provision into a repo. */
export type Recipe = {
  id: string;
  name: string;
  description: string;
  /** Per-repo config the installer collects (set as repo variables on install). */
  inputs: RecipeInput[];
  /** Render the repo-relative files this recipe writes (pure). */
  render: () => ProposedFile[];
};

// Pinned action SHAs (resolved from the latest stable tags).
const CREATE_APP_TOKEN = "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1"; // v3.2.0
const ADD_TO_PROJECT = "actions/add-to-project@5afcf98fcd03f1c2f92c3c83f58ae24323cc57fd"; // v2.0.0

// Each workflow opens with a managed header so a later reconcile can identify Orchid-owned files,
// and self-disables (`if: vars… != ''`) so it stays inert until the maintainer activates it.
const AUTO_ADD_TO_PROJECT_WORKFLOW = [
  "# >>> orchid: recipe=auto-add-to-project version=1 <<<",
  "# Managed by Orchid — adds newly opened issues to a GitHub Project.",
  "# ORCHID_APP_ID + ORCHID_PROJECT_URL are variables; ORCHID_APP_PRIVATE_KEY is a pre-provisioned",
  "# org secret (set by Orchid). The guard checks the variables (secrets can't be tested in if:).",
  "name: Orchid auto-add issues to project",
  "",
  "on:",
  "  issues:",
  "    types: [opened]",
  "",
  "permissions:",
  "  contents: read",
  "",
  "jobs:",
  "  add-to-project:",
  "    if: ${{ vars.ORCHID_PROJECT_URL != '' && vars.ORCHID_APP_ID != '' }}",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - name: Mint a GitHub App token",
  "        id: app-token",
  `        uses: ${CREATE_APP_TOKEN} # v3.2.0`,
  "        with:",
  "          app-id: ${{ vars.ORCHID_APP_ID }}",
  "          private-key: ${{ secrets.ORCHID_APP_PRIVATE_KEY }}",
  "      - name: Add issue to project",
  `        uses: ${ADD_TO_PROJECT} # v2.0.0`,
  "        with:",
  "          project-url: ${{ vars.ORCHID_PROJECT_URL }}",
  "          github-token: ${{ steps.app-token.outputs.token }}",
  "",
].join("\n");

const autoAddToProject: Recipe = {
  id: "auto-add-to-project",
  name: "Auto-add issues to a Project",
  description:
    "When an issue is opened, add it to a GitHub Project. Orchid sets the org App credentials and the project URL; the workflow activates on merge.",
  inputs: [
    {
      name: "ORCHID_PROJECT_URL",
      label: "Project URL",
      placeholder: "https://github.com/orgs/<org>/projects/<number>",
      description: "The GitHub Project newly opened issues are added to.",
      type: "url",
    },
  ],
  render: () => [
    {
      path: ".github/workflows/orchid-auto-add-to-project.yml",
      content: AUTO_ADD_TO_PROJECT_WORKFLOW,
    },
  ],
};

/** The bundled automation recipe catalog. */
export const RECIPES: Recipe[] = [autoAddToProject];

/** Look up a recipe by id. */
export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
