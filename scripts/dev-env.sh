#!/usr/bin/env bash
# Start `next dev` with secrets injected LIVE from the 1Password Environment named by
# OP_EN_UUID (see .env.local). Vault references resolve at launch via `op run` — no secret
# values are ever written to disk. DATABASE_URL/APP_URL etc. come from the Environment too.
#
# Prereqs:
#   • .env.local contains OP_SERVICE_ACCOUNT_TOKEN + OP_EN_UUID (least-privilege service account)
#   • the durable Postgres is up + migrated:  pnpm db:up  &&  pnpm db:migrate
set -euo pipefail

if [ ! -f .env.local ]; then
  echo "dev:env — missing .env.local (needs OP_SERVICE_ACCOUNT_TOKEN + OP_EN_UUID)" >&2
  exit 1
fi

# Load the service-account token + environment id (never printed).
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a
: "${OP_SERVICE_ACCOUNT_TOKEN:?dev:env — OP_SERVICE_ACCOUNT_TOKEN missing in .env.local}"
: "${OP_EN_UUID:?dev:env — OP_EN_UUID missing in .env.local}"

exec op run --environment "$OP_EN_UUID" -- pnpm exec next dev
