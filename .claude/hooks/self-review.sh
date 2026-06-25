#!/usr/bin/env bash
# Stop — when there are uncommitted changes, remind of the self-review gate.
# Provider-neutral: emits {"systemMessage": ...}; stays quiet on a clean tree.
set -euo pipefail

# Informational hook — degrade gracefully if jq is unavailable (don't error).
command -v jq >/dev/null 2>&1 || exit 0

# Clean tree = nothing staged, nothing modified, AND no new untracked files.
if git diff --quiet 2>/dev/null \
  && git diff --cached --quiet 2>/dev/null \
  && [ -z "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then
  exit 0
fi

jq -n '{"systemMessage":"Uncommitted changes — before commit/PR, self-review the diff (race conditions, missing filters, edge cases, security) and fix ALL issues found, including ones from earlier steps. Keep the gates green (typecheck, tests, docstring-coverage)."}'
