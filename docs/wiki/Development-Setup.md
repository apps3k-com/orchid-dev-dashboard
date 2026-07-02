# Development Setup

Durable local development for Orchid: **Postgres runs in OrbStack** (persistent), the **app runs on
the host** via `pnpm dev:env` (Next.js + its in-process graphile-worker), and **secrets come from a
1Password Environment** — nothing secret is written to disk.

This is the *dev* stack. The shipped self-host bundle is `docker-compose.yml` (app **and** db in
containers) — see the Wiki's deployment notes; don't confuse the two.

## Prerequisites

- **OrbStack** (or any Docker engine) — provides the container runtime for Postgres.
- **Node 22** + **pnpm 10** (`corepack enable`), and **`op`** (1Password CLI ≥ 2.30).
- **`.env.local`** in the repo root with a least-privilege 1Password **service account** token and the
  environment id — exactly:
  ```
  OP_SERVICE_ACCOUNT_TOKEN=<service-account token, read access to the app-orchid-local vault + env>
  OP_EN_UUID=<the 1Password Environment id>
  EMAIL=<shadcnstudio account email>      # build/dev-time only (shadcn CLI)
  LICENSE_KEY=<shadcnstudio license key>  # build/dev-time only
  ```
  `.env.local` is git-ignored. The service account can **read** the Environment but cannot write it.

## Secrets model

- App secrets (GitHub App id/key/client/secret, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, …) live as an
  item (`orchid-app`) in the **`app-orchid-local`** vault.
- A 1Password **Environment** (`OP_EN_UUID`) maps each app variable to a vault reference, plus the
  non-secret local literals (`DATABASE_URL` → the OrbStack DB on `:5433`, `APP_URL`,
  `ORCHID_LLM_ADMINS`, …).
- `pnpm dev:env` runs `op run --environment "$OP_EN_UUID" -- next dev`, resolving everything at launch.
- The **Anthropic BYOK key** is *not* an env var — enter it once in the app (Settings → AI providers).
  It is encrypted and stored in Postgres, so it survives restarts.

## The durable database (OrbStack)

`docker-compose.dev.yml` defines a single `postgres:16-alpine` service with a persistent named volume
(`orchid-dev-db`), `restart: unless-stopped`, and the port published on **`:5433`** (so it coexists
with a Homebrew Postgres on `:5432`).

| Command | What it does |
|---|---|
| `pnpm db:up` | Start Postgres in OrbStack, wait until healthy (data persists across restarts). |
| `pnpm db:migrate` | Apply Prisma migrations to `:5433`. |
| `pnpm db:down` | Stop the container (keeps the data volume). |
| `pnpm db:reset` | Drop the volume, recreate, re-migrate (fresh schema). |

## First run

```bash
pnpm install
pnpm db:up          # durable Postgres in OrbStack (:5433)
pnpm db:migrate     # create the schema
pnpm dev:env        # app + worker on http://localhost:3000 (secrets from 1Password)
```

Then, in the app:

1. **Log in** with the GitHub App (member-gated OAuth).
2. **Refresh data** on the Dashboard — the worker's `sync:all` populates repos/PRs/projects.
3. **Settings → AI providers** — paste the Anthropic key (stored encrypted in the durable DB).

Because the database is persistent, repos, audits, and the provider key stay put between sessions —
no re-sync each time.

## Fleet-Audit end-to-end

`/audits` → select repos (all active are pre-selected) → **Audit selected** (tick consent) → the
worker estimates each repo's cost → **Confirm & run** → the panel polls to completion. Unchanged
repos are skipped as `skip_unchanged` ($0); over-cap repos are flagged and excluded.

## Tests

`pnpm check` (lint + typecheck) · `pnpm test` (Vitest) · `pnpm build`. The unit/worker tests mock the
DB, so they need neither OrbStack nor `op`.
