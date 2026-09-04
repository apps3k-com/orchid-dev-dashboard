#!/usr/bin/env bash
# Inject the local 1Password Environment without reading a mounted .env FIFO.
# Run in a worktree; its bootstrap token may remain in the original checkout.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
exec python3 scripts/dev-launch.py "$@"
