#!/usr/bin/env bash
# PostToolUse(Bash) — right after a PR is created, make the CodeRabbit loop MANDATORY.
# PostToolUse only fires when the tool actually ran (a blocked `gh pr create` never
# reaches here), so matching the command means a PR was really opened.
# Provider-neutral: emits {"systemMessage": ...} (surfaced by Claude Code + Codex).
set -euo pipefail
command -v jq >/dev/null 2>&1 || exit 0

CMD=$(cat | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
printf '%s' "$CMD" | grep -qE 'gh[[:space:]]+pr[[:space:]]+(create|new)' || exit 0

jq -n '{"systemMessage":"PR opened → the CodeRabbit loop is now MANDATORY (no PR without it). Monitor the review (~15 min; extend in 5-min steps; comment \"@coderabbitai full review\" if it stalls). For EVERY finding: verify it, then fix it or reject it with a reasoned reply — always mention @coderabbitai. Push valid learnings to apps3k-memory. The task is NOT done until CodeRabbit is through; the Stop guard (coderabbit-loop-guard.sh) blocks finishing while feedback is open."}'
