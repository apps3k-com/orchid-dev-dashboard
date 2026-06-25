# GitHub Projects — apps3k taxonomy & workflow

Canonical definition of how apps3k uses **GitHub Projects** for project management.
Applies to every repo on the common workflow. Replaces the former plane.so setup.

> Documentation does **not** live in the Project — it lives in the per-repo GitHub
> Wiki (`docs/wiki/`). The Project holds **work items** (issues), not docs.

## The three layers — keep them separate, never duplicate

apps3k work-item metadata lives in three places. Each dimension belongs to exactly one
layer; duplicating a dimension across layers is the main thing to avoid.

| Layer | Where | Carries | Edit at |
|---|---|---|---|
| **Issue Type** | org | what *kind* of work this is | `settings/issue-types` |
| **Issue Fields** | org | Priority, Size, Impact, On Hold, Bug/Feature status, dates, reporter | `settings/issue-fields` |
| **Labels** | repo | only what no Type/Field covers — above all `module:*` | `templates/github/labels.yml` |
| **Project Status** | project | where the item is in the flow (Backlog → … → Done) | the Project |

**Agent decision rule:** *kind of work* → Issue **Type**. *Priority / size / impact /
hold / bug-or-feature status / reporter* → Issue **Field**. *Which module of this system*
→ **Label** `module:*`. *Where in the flow* → **Project Status**. Never encode a Field's
value as a label or a project field.

## Issue Types (org)

`Task` · `Bug` · `Feature` · `Epic` · `Support`. One type per issue.

- **Epic** — parent that groups connected issues toward one goal. Uses native
  **sub-issues** for its children. Auto-synced (see below).
- **Task** — default unit of work.
- **Bug** — defect; triage via the `Bug Status` field.
- **Feature** — new functionality / feature request; triage via the `Feature Request Status` field.
- **Support** — externally submitted requests; reporter captured via `Created by – *` fields.

Mapping from the old Plane types: *User Story* → `Task` (or a `Feature` sub-issue);
*Ticket* → `Support`; *Feature Request* → `Feature`; *User Test* → `Task`.

## Issue Fields (org) — do NOT recreate as labels or project fields

These exist org-wide at `settings/issue-fields`; reuse them, never duplicate them:

| Field | Type | Options |
|---|---|---|
| `Priority` | single-select | Urgent, High, Medium, Low |
| `Size` | single-select | XS, S, M, L, XL |
| `Impact` | single-select | Low, Medium, High, Critical |
| `On Hold` | single-select | Feedback needed, Decision needed, Blocker detected |
| `Bug Status` | single-select | Open, Confirmed, Can't reproduce, Selected, Solved |
| `Feature Request Status` | single-select | Open, Accepted, Selected, Released |
| `Target date` | date | — |
| `Created at – Date` | date | — |
| `Created by – Name/Email/Company` | text | — |

These replace the old Plane label pipelines (`bug: *`, `feature request: *`), the
`urgent`/size/severity labels and `needs decision` — all now Fields.

## Project Status

The flow lives in the Project's **Status** single-select field. Three anchor options are
required by the automation (configurable, but these are the defaults):

- **Backlog** — initial resting state (where auto-add drops new items).
- **In Progress** — actively being worked.
- **Done** — completed.

Any additional columns (e.g. `Todo`, `In Review`, `Ready for QA`, `Blocked`) are free to
add; the automation only ever moves Backlog→In Progress and →Done, and never downgrades a
mid-flow status you set by hand.

## Labels

Labels carry only what Types/Fields don't. The canonical set is
[`templates/github/labels.yml`](../templates/github/labels.yml):

- **`module:*`** — the primary class: which module of *this* system an issue touches
  (`module:picking`, `module:packing`, `module:auth`, …). The module list lives in
  **`.github/modules.yaml`** (per repo; PR-reviewed, versioned, CODEOWNERS-gateable).
- **`product:*`** — which product an issue belongs to, for **cross-repo Project boards**.
  The product list is the **`PRODUCTS` org variable** (one taxonomy for the whole org).
- A minimal triage set (`good first issue`, `help wanted`, `dependencies`).
- Optional `area:*` (technical layer) — off by default.

### Module & Product — controlled dropdowns, not free text

`module` and `product` are **dropdowns** in the issue forms (`.github/ISSUE_TEMPLATE/`), not
free text — so a typo can't spawn a near-duplicate. Sources of truth:

- **Modules → `.github/modules.yaml`** (per repo). PR-reviewed, versioned, and CODEOWNERS-
  gateable for tight control. A push to it re-runs the sync.
- **Products → `PRODUCTS` org variable** (one org-wide taxonomy, for cross-repo boards).

Because issue forms can't read these at render time, the
[`issue-form-options-sync`](../.github/workflows/issue-form-options-sync.yml) workflow
regenerates the dropdown options from both sources and ensures the matching `module:*` /
`product:*` labels exist. On issue creation/edit,
[`issue-form-labeler`](../.github/workflows/issue-form-labeler.yml) applies
`module:<selection>` / `product:<selection>` so the labels (and Project filtering) stay in
sync with the dropdowns. Never hand-edit the option lists — they live between `# >>> … <<<`
markers and are overwritten by the sync.

```bash
# Modules: edit .github/modules.yaml in a PR (push to main re-runs the sync automatically):
#   modules:
#     - picking
#     - packing
gh variable set PRODUCTS --org apps3k-com --body "wms,storefront"   # products: org-wide
gh workflow run "Sync issue-form options" --repo <owner>/<repo>     # or regenerate on demand
```

> To lock the module list to specific reviewers, add `/.github/modules.yaml @owner-or-team`
> to the repo's `CODEOWNERS`.

Sync / clean up labels:

```bash
node scripts/github/labels-sync.mjs                 # dry-run, current repo
node scripts/github/labels-sync.mjs --apply         # create/update canonical labels
node scripts/github/labels-sync.mjs --all-repos     # org-wide inventory (dry-run)
node scripts/github/labels-sync.mjs --all-repos --apply --prune --yes  # org-wide cleanup
```

> **`--prune` is destructive and per-repo-aware.** It never deletes the protected prefixes
> `module:*` / `product:*` / `area:*` / `autorelease:*` (release-please) / `agent:*` (override
> via `--protect`). Always review
> the dry-run first: other namespaces (e.g. `scope:*`, `type:*`, `phase:*`) may be a repo's
> own taxonomy worth keeping or renaming. Deleting a label removes it from its issues.

## Epics & sub-issues — automatic status propagation

GitHub has **no native** parent↔child status sync, so a reconciler provides it:
[`scripts/github/project-sync.mjs`](../scripts/github/project-sync.mjs), run by
[`.github/workflows/project-epic-sync.yml`](../.github/workflows/project-epic-sync.yml).

Rules (parent = an issue whose Type is `Epic`, children = its native sub-issues):

1. A sub-issue **leaves `Backlog`** (started, or closed) → Epic Status → **`In Progress`**
   (only while the Epic is still in Backlog; never downgrades a later status).
2. **All** sub-issues closed → **close the Epic** + Epic Status → **`Done`**.
3. A sub-issue **re-opens** while the Epic is closed → **re-open the Epic** + **`In Progress`**.

Triggers: `issues: [closed, reopened]` (instant) + a `*/15` schedule (catch-all for
Project field edits, which Actions can't observe) + manual `workflow_dispatch`.

The default `GITHUB_TOKEN` cannot write Projects, so the workflow mints a **GitHub App**
token. The App needs **Issues: Read & write** + **Projects (org): Read & write**; install
it on the org and set `vars.PROJECT_SYNC_APP_ID` + `secrets.PROJECT_SYNC_APP_PRIVATE_KEY`,
plus `vars.PROJECT_OWNER` / `vars.PROJECT_NUMBER`.

## Built-in Project workflows to enable (per Project, in the UI)

These cover the simple cases (the custom Action only does Epic propagation):

- **Auto-add** — filter by repo → new issues/PRs join the Project at `Status = Backlog`.
- **Item closed** / **Pull request merged** → `Status = Done`.
- (optional) **Code review approved** → a status of your choice.

## Commit / PR conventions

- **Conventional Commits** for every commit; a commit *may* reference its issue as `(#N)`.
- The **PR body links its issue** with a closing keyword — `Closes #N` (`Fixes`/`Resolves`
  also work). GitHub then auto-closes the issue on merge and the Project's built-in
  workflow moves it to `Done`. Mention secondary issues without a closing keyword.
- One long-lived branch `main`; `feature/<scope>` → PR to `main`; the owner merges.
