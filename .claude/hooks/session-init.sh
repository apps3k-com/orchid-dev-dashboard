#!/usr/bin/env bash
# SessionStart — inject the apps3k common-workflow rules + branch warning.
# Provider-neutral: emits {"systemMessage": ...} (surfaced by Claude Code + Codex).
# Configure: PROTECTED_BRANCH (default main).
set -euo pipefail
PB="${PROTECTED_BRANCH:-main}"

# Informational hook — degrade gracefully if jq is unavailable (don't error).
command -v jq >/dev/null 2>&1 || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
WARN=""
# ANSI-C quoting so the trailing blank lines are REAL newlines, not literal \n.
[ "$BRANCH" = "$PB" ] && WARN=$'WARNING: you are on \''"$PB"$'\'. Create a feature/<scope> branch before changing anything.\n\n'

CTX="${WARN}apps3k common workflow (branch: ${BRANCH})
- Search apps3k-memory before any work; read referenced GitHub issues.
- main-only: feature/<scope> from $PB -> PR against $PB. Never commit/push/merge $PB directly; the owner merges PRs.
- No hallucination: verify against the codebase, the live DB and third-party systems — never guess.
- Conventional Commits; the PR links its issue (Closes #N).
- Self-review before a PR (fix issues from earlier steps too); then the CodeRabbit loop.
- Keep the local gates green (typecheck, tests, docstring-coverage >= 80%).
- Never deploy to production yourself; never delete/modify production data."

jq -n --arg c "$CTX" '{"systemMessage":$c}'
