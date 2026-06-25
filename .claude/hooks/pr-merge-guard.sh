#!/usr/bin/env bash
# PreToolUse(Bash, gh pr merge) — the agent never merges PRs.
# Provider-neutral: blocks via exit 2 + stderr.
set -euo pipefail

CMD=$(cat | jq -r '.tool_input.command // ""')
# Normalize away gh GLOBAL options between `gh` and `pr` (e.g. `gh -R owner/repo pr
# merge`, `gh --repo=owner/repo pr merge`, glued short form `gh -Rowner/repo pr
# merge`) so they can't bypass detection. `-R` allows a glued/spaced/`=` value;
# `--repo` requires a space or `=`. Global (`g`) so EVERY `gh ... pr` segment in a
# chained command is canonicalized, not just the first.
CMD=$(printf '%s' "$CMD" | sed -E 's/(^[[:space:]]*|[;&|()]+[[:space:]]*)gh[[:space:]]+(((-R([[:space:]]+|=)?|--repo([[:space:]]+|=))[^[:space:]]+)[[:space:]]+)*pr/\1gh pr/g')
# gh also accepts -R/--repo AFTER the `pr` subcommand (`gh pr -R o/r merge`); strip
# those too so they can't sit between `pr` and `merge`. Targeted to -R/--repo (the
# value-taking flag) — NOT arbitrary text — so `gh pr create --title "...merge..."`
# is never misread as a merge.
CMD=$(printf '%s' "$CMD" | sed -E 's/(gh[[:space:]]+pr[[:space:]]+)(((-R([[:space:]]+|=)?|--repo([[:space:]]+|=))[^[:space:]]+)[[:space:]]+)+/\1/g')
# Detect on a quote-stripped copy so a command that merely MENTIONS the phrase in a
# quoted argument (e.g. `gh pr comment 9 --body "... gh pr merge ..."`) is not misread.
DETECT=$(printf '%s' "$CMD" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")
printf '%s' "$DETECT" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge' || exit 0

echo "BLOCKED: the agent never merges PRs. The project owner merges after the CodeRabbit loop." >&2
exit 2
