#!/usr/bin/env bash
# PreToolUse(Bash, git commit) — protected-branch guard + Conventional Commits.
# The Conventional-Commit check runs on the extracted -m MESSAGE, never the whole
# command line. Editor commits (no inline message) can't be inspected here and pass
# through. Work-item linking is enforced on the PR (Closes #N), not the commit.
#
# Provider-neutral: blocks via exit code 2 + stderr, honored by Claude Code and
# Codex. Shared by .claude/settings.json and .codex/hooks.json. Configure via env:
#   PROTECTED_BRANCH  (default: main)
set -euo pipefail
PB="${PROTECTED_BRANCH:-main}"

CMD=$(cat | jq -r '.tool_input.command // ""')
# Normalize away git GLOBAL options between `git` and `commit` (e.g.
# `git -c user.email=x commit`, `git -cuser.email=x commit` glued, `git -C/path
# commit`, `git --git-dir .git commit`) so they can't bypass the protected-branch
# + message checks. The value delimiter is OPTIONAL so glued short forms (`-cX`,
# `-C/path`) are normalized too. Same value/flag set as the other guards.
CMD=$(printf '%s' "$CMD" | sed -E 's/(^[[:space:]]*|[;&|()]+[[:space:]]*)git[[:space:]]+(((-c|-C|--git-dir|--work-tree|--namespace|--exec-path|--super-prefix|--config-env|--attr-source)([[:space:]]+|=)?[^[:space:]]+|--bare|--no-pager|--paginate|--no-optional-locks|--literal-pathspecs|--no-literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-replace-objects|--no-advice|-p|-P)[[:space:]]+)*commit/\1git commit/')
printf '%s' "$CMD" | grep -qE 'git[[:space:]]+commit([[:space:]]|$)' || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ "$BRANCH" = "$PB" ]; then
  echo "BLOCKED: never commit directly on '$PB'. Create a feature branch: git switch -c feature/<scope>" >&2
  exit 2
fi

# Message checks apply only to an inline -m message; -F/--file/--amend and
# templated messages can't be parsed here and are passed through. Detect these
# flags ONLY in the part BEFORE the first message flag, so option-like text inside
# the message (e.g. `git commit -m "fix --file handling"`) can't force a bypass.
# The message flag is `--message` or any short bundle ending in `m` (`-m`, `-am`,
# `-sam`), with the value spaced/`=`/glued — matching the perl extractor below.
PRE_MSG=$(printf '%s' "$CMD" | sed -E 's/(^|[[:space:]])(--message|-[A-Za-z]*m)([[:space:]]|=|["'\'']|[^[:space:]]).*//')
if printf '%s' "$PRE_MSG" | grep -qE '(^|[[:space:]])(--amend|(-F|--file)(=|[[:space:]]|$))'; then
  exit 0
fi
# Extract the message from any -m / --message form, including combined short
# flags (-m "x", -m'x', -m"x", -mx, -am "x", -sam 'x', --message "x",
# --message=x). \x27 = single quote, to keep this perl single-quoted.
MSG=$(printf '%s' "$CMD" | perl -ne '
  if (/(?:^|\s)--message(?:=|\s+)("([^"]*)"|\x27([^\x27]*)\x27|\S+)/
      || /(?:^|\s)-[A-Za-z]*m\s*("([^"]*)"|\x27([^\x27]*)\x27|\S+)/) {
    my $r = $1; $r =~ s/^["\x27]//; $r =~ s/["\x27]$//; print $r; exit;
  }')
if [ -z "$MSG" ]; then
  # No inline message → composed in an editor, which a PreToolUse hook cannot
  # inspect. Conventional Commits can't be checked here; pass through.
  exit 0
fi

# Conventional Commits (on the message).
if ! printf '%s' "$MSG" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?!?:[[:space:]].+'; then
  echo "BLOCKED: commit message must follow Conventional Commits: type(scope): description." >&2
  echo "  Types: feat fix docs style refactor perf test chore ci build revert" >&2
  echo "  Got: $MSG" >&2
  exit 2
fi
exit 0
