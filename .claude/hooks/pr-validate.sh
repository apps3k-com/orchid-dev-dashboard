#!/usr/bin/env bash
# PreToolUse(Bash, gh pr create) — enforce the protected-branch base; remind of PR requirements.
# Provider-neutral: blocks via exit 2 + stderr; otherwise surfaces a reminder.
set -euo pipefail
PB="${PROTECTED_BRANCH:-main}"; PB="${PB#refs/heads/}"
# Allowed PR base branches (comma-separated), overridable via WORKFLOW_PR_BASES.
# The default lives HERE (not in .claude/settings.json) so Claude Code and Codex
# behave identically — both providers run this same script. main-only: PRs target
# the protected branch (`main`).
ALLOWED="${WORKFLOW_PR_BASES:-$PB}"

CMD=$(cat | jq -r '.tool_input.command // ""')
# Normalize away gh GLOBAL options between `gh` and `pr` (e.g. `gh -R owner/repo pr
# create`, `gh --repo=owner/repo pr create`, glued short form `gh -Rowner/repo pr
# create`) so they can't bypass detection. `-R` allows a glued/spaced/`=` value;
# `--repo` requires a space or `=`. Anchored at command start / a shell separator
# so a literal `gh pr` inside an argument is not rewritten. Global (`g`) so EVERY
# `gh ... pr` segment in a chained command is canonicalized, not just the first.
CMD=$(printf '%s' "$CMD" | sed -E 's/(^[[:space:]]*|[;&|()]+[[:space:]]*)gh[[:space:]]+(((-R([[:space:]]+|=)?|--repo([[:space:]]+|=))[^[:space:]]+)[[:space:]]+)*pr/\1gh pr/g')
# gh also accepts -R/--repo AFTER the `pr` subcommand (`gh pr -R o/r create`); strip
# those too so they can't sit between `pr` and `create`. Targeted to -R/--repo (the
# value-taking flag) — NOT arbitrary text.
CMD=$(printf '%s' "$CMD" | sed -E 's/(gh[[:space:]]+pr[[:space:]]+)(((-R([[:space:]]+|=)?|--repo([[:space:]]+|=))[^[:space:]]+)[[:space:]]+)+/\1/g')
# Detect on a quote-stripped copy so a command that merely MENTIONS the phrase in a
# quoted argument (e.g. `gh pr comment 9 --body "... gh pr new ..."`) is not mistaken
# for a real create/new invocation. The original CMD is kept for base/body extraction.
# `gh pr new` is a hidden built-in alias for `gh pr create` — match both so it can't bypass.
DETECT=$(printf '%s' "$CMD" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")
printf '%s' "$DETECT" | grep -qE 'gh[[:space:]]+pr[[:space:]]+(create|new)' || exit 0

# Catch every base form: --base <x>, --base=<x>, -B <x>, -B=<x>.
BASE=$(printf '%s' "$CMD" \
  | grep -oE '(--base[[:space:]]+|--base=|-B[[:space:]]+|-B=)[^[:space:]]+' \
  | head -1 \
  | sed -E 's/^(--base[[:space:]]+|--base=|-B[[:space:]]+|-B=)//' || true)
if [ -n "$BASE" ] && ! printf ',%s,' "$(printf '%s' "$ALLOWED" | tr -d '[:space:]')" | grep -Fq ",${BASE},"; then
  echo "BLOCKED: PRs must target one of [$ALLOWED] (got base '$BASE')." >&2
  exit 2
fi

# GitHub issue link (fail-closed): the PR must close its work item with a keyword
# (Closes/Fixes/Resolves #N) so GitHub closes the issue on merge and the Project's
# built-in workflow moves it. Inline --body/-b is read directly; --body-file/-F is
# read from disk. Toggle with WORKFLOW_REQUIRE_ISSUE_REF (default: true).
if [ "${WORKFLOW_REQUIRE_ISSUE_REF:-true}" = "true" ]; then
  # 1) Inline --body/-b VALUE (perl slurp → multi-line safe). Extracting the value
  #    means a "--body-file" substring inside the body can't be mistaken for the flag.
  BODY=$(printf '%s' "$CMD" | perl -0777 -ne '
    if (/(?:^|\s)--body(?:=|\s+)"([^"]*)"/)          { print $1; exit }
    if (/(?:^|\s)--body(?:=|\s+)\x27([^\x27]*)\x27/) { print $1; exit }
    if (/(?:^|\s)--body=(\S+)/)                       { print $1; exit }
    if (/(?:^|\s)-b\s*"([^"]*)"/)                     { print $1; exit }
    if (/(?:^|\s)-b\s*\x27([^\x27]*)\x27/)            { print $1; exit }
    if (/(?:^|\s)-b=?(\S+)/)                          { print $1; exit }' 2>/dev/null || true)
  # 2) No inline body → read the --body-file/-F <path> from disk (a real flag only,
  #    since no --body/-b was present above).
  if [ -z "$BODY" ]; then
    BF=$(printf '%s' "$CMD" | perl -0777 -ne '
      if (/(?:^|\s)--body-file(?:=|\s+)"([^"]*)"/)          { print $1; exit }
      if (/(?:^|\s)--body-file(?:=|\s+)\x27([^\x27]*)\x27/) { print $1; exit }
      if (/(?:^|\s)--body-file(?:=|\s+)(\S+)/)              { print $1; exit }
      if (/(?:^|\s)-F\s*"([^"]*)"/)                          { print $1; exit }
      if (/(?:^|\s)-F\s*\x27([^\x27]*)\x27/)                 { print $1; exit }
      if (/(?:^|\s)-F(?:=|\s+)(\S+)/)                        { print $1; exit }
      if (/(?:^|\s)-F(\S+)/)                                 { print $1; exit }' 2>/dev/null || true)
    [ -n "$BF" ] && [ "$BF" != "-" ] && [ -f "$BF" ] && BODY=$(cat "$BF" 2>/dev/null || true)
  fi
  # 3) Require a closing keyword with word boundaries on BOTH sides of #<n> so
  #    'prefixes #1' != 'fixes #1' and 'Closes #12abc' (malformed) doesn't pass as '#12'.
  if ! printf '%s' "$BODY" | grep -qiE '(^|[^[:alnum:]_])(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]+#[0-9]+($|[^[:alnum:]_])'; then
    echo "BLOCKED: link the issue with a closing keyword, e.g. 'Closes #123', in --body or --body-file. Set WORKFLOW_REQUIRE_ISSUE_REF=false to relax. Mention secondary issues without a keyword." >&2
    exit 2
  fi
fi

jq -n '{"systemMessage":"PR checklist: self-review done (fix issues from earlier steps too); PR body links its issue (Closes #N); Conventional Commit title; local gates green (typecheck, tests, docstring-coverage). After opening, see the CodeRabbit review through to resolution before handing back."}'
exit 0
