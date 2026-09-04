# Development Setup

Durable local development for Orchid: **Postgres runs in OrbStack** (persistent), the **app runs on
the host** via `pnpm dev:env` (Next.js + its in-process graphile-worker), and **secrets come from a
1Password Environment** — nothing secret is written to disk.

This is the *dev* stack. The shipped self-host bundle is `docker-compose.yml` (app **and** db in
containers) — see the Wiki's deployment notes; don't confuse the two.

## Workstation setup (macOS arm64)

Use a development worktree without a `.env` FIFO. The original repository's mounted `.env`
remains untouched. The launcher finds the original repository through Git's common directory
and reads only its regular `.env.local` bootstrap file; override this with
`ORCHID_BOOTSTRAP_ENV_FILE` when needed. That file only needs `OP_SERVICE_ACCOUNT_TOKEN`.
The default Environment is `did6rpqt5bxv3wzep6a47qtc7u`; `OP_EN_UUID` can override it.

Run once from the worktree:

```bash
python3 scripts/setup-dev-tools.py
export PATH="$HOME/.cache/orchid-tools/node-v22.23.2-darwin-arm64/bin:$PATH"
corepack pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
```

The installer keeps Node **22.23.2** and the signed 1Password CLI **2.39.1-beta.01** in
`~/.cache/orchid-tools/`. The pinned beta supports `op run --environment`; stable CLI 2.39.0
does not. System-wide tools remain unchanged. The package manager is pinned to pnpm 10.15.0.

## Start and stop

```bash
export PATH="$HOME/.cache/orchid-tools/node-v22.23.2-darwin-arm64/bin:$PATH"
pnpm db:up
ORCHID_WORKFLOW_ADMINS=apps3000 \
WORKFLOW_INFRA_REPOSITORY=apps3k-com/hetzner-cloud \
WORKFLOW_BRIDGE_URL=http://127.0.0.1:8789 pnpm dev:env
```

Next.js and its background worker run on **http://localhost:3000**. Stop the host process with
Ctrl-C; `pnpm db:down` stops Postgres while preserving its named volume. Do not use `db:reset`
for routine development: it deletes the local database volume.

Postgres 16 runs as `orchid-dev-db`, bound only to **127.0.0.1:5433**. Compose uses
`--env-file /dev/null`, so it does not read the original `.env` pipe. All migration and application
commands target the local `orchid` database; the launcher overrides database and app URL after
1Password injection. App secrets live only in the process environment. The bootstrap service
account token is removed before Next.js starts.

The current worktree is `/Users/soundandstuff/coding/apps3k/orchid-dev-dashboard-workflow`.
Its persistent volume is `orchid-dev-dashboard-workflow_orchid-dev-db`. Seventeen existing
Prisma migrations were applied on 2026-09-04 without resetting data.

## Local bridge and workflow control

The separate bridge runs in the infra worktree. Its local launcher **always** enforces observe
mode and disables the Todo dispatcher. Create its database once if absent, using the local
Postgres administrator, then start it in a separate terminal:

```bash
# Run from the Orchid worktree. Credentials are never written to a generated .env file.
WORKFLOW_BRIDGE_URL=http://127.0.0.1:8789 bash scripts/dev-env.sh python3 \
  /Users/soundandstuff/coding/apps3k/hetzner-cloud-workflow/scripts/plane-bridge-local.py
```

The `plane_github_bridge` database already exists in the local Postgres instance. Bridge dependencies
are installed with `npm ci` in `hetzner-cloud-workflow/configs/plane-github`. The infra launcher's
scoped bootstrap is read from the original infra `.env.local` (`INFRA_BOOTSTRAP_ENV_FILE` override).
It uses the authenticated GitHub CLI for read access and the canonical infra 1Password items for
Plane and Coolify. With a loopback bridge URL, both local processes derive purpose-separated API
tokens from Orchid's injected session secret. Remote bridge deployments require independently
provisioned read/operator tokens; this local derivation is never used for them.

Log in with GitHub, refresh data on the dashboard, then open **Workflows**. OAuth requires the
human's browser session. `ORCHID_WORKFLOW_ADMINS` is a comma-separated GitHub login allowlist;
`apps3000` is the verified local account. Configuration proposals also require organization
membership and access to the configured infrastructure repository. See
[Workflow control](../workflow-control.md) for simulation, delivery evidence and PR proposals.

The Anthropic BYOK key is optional for this workflow; AI audits use the separately configured
provider key stored encrypted in the durable local database.

## Fleet-Audit end-to-end

`/audits` → select repos (all active are pre-selected) → **Audit selected** (tick consent) → the
worker estimates each repo's cost → **Confirm & run** → the panel polls to completion. Unchanged
repos are skipped as `skip_unchanged` ($0); over-cap repos are flagged and excluded.

## Tests

`pnpm check` (lint + typecheck) · `pnpm test` (Vitest) · `pnpm build`. The unit/worker tests mock the
DB, so they need neither OrbStack nor `op`.
