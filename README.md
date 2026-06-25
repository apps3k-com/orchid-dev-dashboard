# Orchid — The Developer Dashboard

Open-source, self-hostable **mission control for many GitHub repositories**. Stop jumping
repo to repo: see all your pull requests by status, your GitHub Projects, your per-repo
module and org-wide product taxonomies, and your agent hooks — and **provision automations**
(auto-add issues to a Project, set status on transitions, Epic↔sub-issue sync) — from one
place.

> Status: **early development** (v1 in progress). Repo: `apps3k-com/orchid-dev-dashboard`.

## Why

Teams running a shared GitHub-Projects + agent workflow across many repos spend a lot of time
context-switching to maintain taxonomies, watch PRs, wire Project automations, and keep agent
hooks in sync. Orchid is the control plane on top of that workflow.

## Features (v1, in progress)

- **Cross-repo PR board** grouped by status (draft / changes-requested / approved /
  checks-failing / ready / blocked), with CodeRabbit state.
- **GitHub Projects** overview — items by Status, repo links.
- **Module editor** (per repo, writes `.github/modules.yaml` via PR) and **Product editor**
  (org-wide).
- **Automation provisioning** — install/update/remove parametrized GitHub Actions workflows
  (Epic-sync, auto-add-to-project, issue-status-on-transition) via PR.
- **Agent-hooks overview** — drift of each repo's `.claude`/`.codex` hooks vs a canonical
  template repo.

Everything Orchid writes to a repo goes through a **feature branch → pull request** (it never
pushes to a default branch). The one exception is the org-wide `PRODUCTS` variable.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui · Prisma 6 +
Postgres · graphile-worker (Postgres-backed jobs) · Octokit. Self-contained: the bundle is
just **the app + Postgres** — no external Inngest/n8n required.

## Quick start (self-host)

```bash
git clone https://github.com/apps3k-com/orchid-dev-dashboard
cd orchid-dev-dashboard
cp .env.example .env        # fill in the GitHub App + session values (see below)
docker compose up --build   # starts Postgres, runs migrations, starts the app on :3000
```

Then open <http://localhost:3000/setup> and follow the onboarding: create a GitHub App from
the provided manifest, install it on your org(s), and sign in with GitHub.

The GitHub App needs: **Contents RW, Issues RW, Pull requests RW, Projects (org) RW, Actions
Variables RW, Members R, Metadata R**, with user authorization (OAuth) enabled. Details in
[`docs/setup.md`](docs/setup.md) (added with the onboarding increment).

## Development

```bash
pnpm install
pnpm prisma:dev        # apply migrations to a local Postgres (set DATABASE_URL)
pnpm dev               # http://localhost:3000
pnpm check             # lint + typecheck
pnpm test              # vitest
```

## Contributing

Conventional Commits; work on short-lived `feature/*` (or `fix/*`, `chore/*`, `docs/*`)
branches; PRs target `main` and link an issue (`Closes #N`). CI must be green and the CodeRabbit review resolved before merge. The UI is
built **exclusively from shadcn/ui + shadcnstudio.com blocks** — see `AGENTS.md`.

## License

MIT.
