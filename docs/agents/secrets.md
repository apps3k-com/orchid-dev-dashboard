# Secrets & 1Password

1Password is the **canonical** secret store. Code, logs, commits, PRs and memory
hold only **1Password paths** (`op://<vault>/<item>/<field>`) — never secret
values. The committed template is [`.env.example`](../../.env.example); the live
`.env` is git-ignored.

## The standard: one token per repo

A repo's `.env` contains **exactly one** variable, `OP_SERVICE_ACCOUNT_TOKEN`,
pointing at a 1Password **service account scoped to just this repo's vault(s)**
(least privilege). With that token present, `op` runs **non-interactively**, so
any further secret is read on demand — you do not enumerate secrets in `.env`.

A DevOps/root repo (broad infrastructure access) is the documented exception: its
service account may span more vaults. Scope every other repo as narrowly as the
work allows.

## How the live `.env` works (1Password "local-env-file")

The live `.env` is a 1Password **local-env-file**: a FIFO / named pipe
(`prw-------`), not a regular file. Configure it in the 1Password app against an
env template whose values are `op://` refs; 1Password resolves them **on read**
while the app/CLI is unlocked.

Properties to respect:

- **One read per write.** A FIFO yields its contents once per fill. Read it once
  per shell into variables, then reuse those — don't `cat` it repeatedly.
- **Unlock required.** Reads block/fail if 1Password is locked.
- **Non-interactive shells** (e.g. an agent's `Bash` tool) source `~/.zshenv`,
  **not** `~/.zshrc` — put anything the pipe depends on in `~/.zshenv`.

## Loading it (agents & scripts)

```bash
# Read the pipe ONCE, export its vars, then use `op` non-interactively.
set -a; . ./.env; set +a              # OP_SERVICE_ACCOUNT_TOKEN now in env
op whoami                             # confirms the service account
op read "op://<repo-vault>/<item>/<field>"   # any further secret, on demand
```

For build/run, prefer `op run -- <cmd>` or `op inject -i .env.tpl -o .env` so
secrets exist only for the process lifetime.

> **`op inject` parses `op://` in comments too.** Never put a partial or wrapped
> `op://` path in an env-template comment — it will try to resolve it.

## Creating a repo-scoped service account

1. 1Password → **Developer → Service Accounts → New** (`<repo>-ci` or similar).
2. Grant **read** on **only** this repo's vault(s) — nothing else.
3. Copy the token (`ops_…`) once; store it where the repo's 1Password
   local-env-file resolves `OP_SERVICE_ACCOUNT_TOKEN` from.
4. Verify: `op whoami` resolves to that service account with the expected vaults.

## GitHub App for Project automation (Epic↔sub-issue sync)

The Epic sync workflow ([`.github/workflows/project-epic-sync.yml`](../../.github/workflows/project-epic-sync.yml))
needs Projects write access that the default `GITHUB_TOKEN` lacks, so it mints a
**GitHub App** token at runtime.

- App permissions: **Issues: Read & write** + **Projects (org): Read & write**; install
  it on the org.
- The App **private key** is a secret → repo/org secret `PROJECT_SYNC_APP_PRIVATE_KEY`
  (1Password is the canonical source; mirror into GitHub Secrets, never commit it).
- The non-secret App **id** goes in the repo **variable** `PROJECT_SYNC_APP_ID` (alongside
  `PROJECT_OWNER` / `PROJECT_NUMBER`).

## Hard rules

- Never commit real secret values; only `.env.example` (refs/placeholders) is
  committed — `.gitignore` ignores `.env` / `.env.*` except `.env.example`.
- Never echo, print or log a token value (not even partially).
- Never store secret values in memory — store the `op://` path instead.
