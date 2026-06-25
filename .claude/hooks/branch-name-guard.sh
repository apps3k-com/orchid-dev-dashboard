#!/usr/bin/env bash
# PreToolUse(Bash, branch creation) — require a `<prefix>/<name>` branch name on
# every creation form: git checkout -b/-B, git switch -c/-C, and git branch <name>.
# Policy is intentionally permissive about the prefix (feature/ fix/ chore/ docs/
# bvk/ … all accepted) — it only blocks bare names and the reserved long-lived
# branches, so it fits every repo's convention. Provider-neutral: exit 2 + stderr.
set -euo pipefail

CMD=$(cat | jq -r '.tool_input.command // ""')
# Normalize away git GLOBAL options between `git` and the subcommand (e.g.
# `git -c k=v checkout -b main`, `git --git-dir .git switch -c x`) so they can't
# leave BRANCH empty and bypass the check. Same value/flag set as push/merge-guard.
CMD=$(printf '%s' "$CMD" | sed -E 's/(^[[:space:]]*|[;&|()]+[[:space:]]*)git[[:space:]]+(((-c|-C|--git-dir|--work-tree|--namespace|--exec-path|--super-prefix|--config-env|--attr-source)([[:space:]]+|=)?[^[:space:]]+|--bare|--no-pager|--paginate|--no-optional-locks|--literal-pathspecs|--no-literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-replace-objects|--no-advice|-p|-P)[[:space:]]+)*(checkout|switch|branch)/\1git \6/')

# Extract the new branch name from checkout -b/-B or switch -c/-C …
BRANCH=$(printf '%s' "$CMD" | grep -oE 'git[[:space:]]+(checkout[[:space:]]+-[bB]|switch[[:space:]]+-[cC])[[:space:]]+[^[:space:]]+' \
  | sed -E 's/.*-[bBcC][[:space:]]+//' | head -1 || true)
# … or `git branch <name>` (creation; ignore listing and -d/-D/-m/-r/options).
if [ -z "$BRANCH" ]; then
  BRANCH=$(printf '%s' "$CMD" | grep -oE 'git[[:space:]]+branch[[:space:]]+[^-[:space:]][^[:space:]]*' \
    | sed -E 's/git[[:space:]]+branch[[:space:]]+//' | head -1 || true)
fi
[ -z "$BRANCH" ] && exit 0

# Reserved / long-lived branches must never be (re)created via these guarded forms.
case "$BRANCH" in
  main|master|develop|staging|production)
    echo "BLOCKED: '$BRANCH' is a reserved long-lived branch name — don't create it." >&2
    echo "  Branch your work under a prefix instead (e.g. feature/<scope>, fix/<scope>)." >&2
    exit 2
    ;;
esac

# Require a type/scope prefix (a single segment then '/'), e.g. feature/x, fix/y, bvk/z.
if ! printf '%s' "$BRANCH" | grep -qE '^[a-z][a-z0-9._-]*/[A-Za-z0-9]'; then
  echo "BLOCKED: branch '$BRANCH' needs a '<prefix>/<name>' form (e.g. feature/<scope>, fix/<scope>)." >&2
  echo "  Group work with a prefix instead of a bare branch name." >&2
  exit 2
fi

# If it is a release branch, require semantic versioning.
case "$BRANCH" in
  release/*)
    if ! printf '%s' "$BRANCH" | grep -qE '^release/v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
      echo "BLOCKED: release branch must be release/vMAJOR.MINOR.PATCH[-prerelease] (e.g. release/v1.2.0)." >&2
      exit 2
    fi
    ;;
esac
exit 0
