#!/usr/bin/env bash
# PreToolUse(Bash, git push) — block pushes to the protected branch and force pushes.
# Provider-neutral: blocks via exit 2 + stderr. Configure: PROTECTED_BRANCH (default main).
set -euo pipefail
PB="${PROTECTED_BRANCH:-main}"; PB="${PB#refs/heads/}"   # normalize a fully-qualified value

CMD=$(cat | jq -r '.tool_input.command // ""')
# Normalize away git GLOBAL options between `git` and `push` so e.g. `git -c k=v push`
# or `git --git-dir .git push` can't slip past detection — WITHOUT misreading
# informational options (`git --help push` is NOT a push). Only known global options are
# stripped: value-taking ones consume their separate-or-`=` arg; `--help`/`-h`/`--version`
# are intentionally excluded. Anchored at command start / a shell separator so a literal
# `git push` inside an argument is not rewritten.
CMD=$(printf '%s' "$CMD" | sed -E 's/(^[[:space:]]*|[;&|()]+[[:space:]]*)git[[:space:]]+(((-c|-C|--git-dir|--work-tree|--namespace|--exec-path|--super-prefix|--config-env|--attr-source)([[:space:]]+|=)?[^[:space:]]+|--bare|--no-pager|--paginate|--no-optional-locks|--literal-pathspecs|--no-literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-replace-objects|--no-advice|-p|-P)[[:space:]]+)*push/\1git push/')
printf '%s' "$CMD" | grep -qE 'git[[:space:]]+push' || exit 0

# Force pushes are never allowed. Match: --force, --force-with-lease[=<lease>], and any
# short-flag bundle containing 'f' (-f, -af, -fu), terminated by whitespace, end, OR a
# shell operator / '=' (so `--force; ...`, `-af && ...`, `--force-with-lease=x` don't slip
# through). Portable POSIX classes (no \s) so BSD/macOS grep matches too.
if printf '%s' "$CMD" | grep -qE '[[:space:]](--force|--force-with-lease(=[^[:space:];&|]+)?|-[A-Za-z]*f[A-Za-z]*)([[:space:]]|$|[;&|=])'; then
  echo "BLOCKED: force pushes are never allowed. Use a regular push or a new branch." >&2
  exit 2
fi

# Isolate the push invocation (cut at a shell separator so a chained command can't
# smuggle tokens in), drop every option, and inspect ALL positional args / refspecs.
REST=$(printf '%s' "$CMD" \
  | sed -E 's/.*git[[:space:]]+push[[:space:]]*//' \
  | sed -E 's/[;&|()].*$//' \
  | sed -E 's/(^|[[:space:]])(--[A-Za-z][A-Za-z-]*(=[^[:space:]]+)?|-[A-Za-z]+)//g')
# shellcheck disable=SC2086
set -- $REST
# Drop the leading REMOTE only when the first token actually IS one (a configured
# remote name or a URL). Otherwise the first token is already a refspec — e.g.
# `git push HEAD:main` / `git push origin-less-refspec` — and must be inspected,
# not silently shifted away (which would bypass the protected-branch check).
if [ "$#" -gt 0 ]; then
  first="$1"
  if git remote 2>/dev/null | grep -Fxq -- "$first" \
     || printf '%s' "$first" | grep -qE '^([a-z][a-z0-9+.-]*://|[^@[:space:]]+@[^:[:space:]]+:)'; then
    shift   # "$@" now holds refspecs only
  fi
fi

for ref in "$@"; do
  case "$ref" in
    +*) echo "BLOCKED: force pushes (+refspec) are never allowed. Use a regular push or a new branch." >&2; exit 2 ;;
    refs/tags/*|*:refs/tags/*) continue ;;
  esac
  # Determine the remote-side branch. With an implicit destination (no `:`), git
  # pushes to the same-named branch; `HEAD`/`@` resolve to the CURRENT branch — so
  # `git push origin HEAD` while on the protected branch must be caught too.
  case "$ref" in
    *:*)    remote_side="${ref##*:}" ;;                                        # explicit local:remote
    HEAD|@) remote_side=$(git branch --show-current 2>/dev/null || echo "") ;; # implicit dest = current branch
    *)      remote_side="$ref" ;;                                              # source-only: dest = same name
  esac
  remote_side="${remote_side#refs/heads/}"     # normalize refs/heads/<name> -> <name>
  if [ -n "$remote_side" ] && [ "$remote_side" = "$PB" ]; then
    echo "BLOCKED: cannot push directly to $PB. Open a PR: gh pr create --base $PB" >&2
    exit 2
  fi
done

# No explicit refspec → block if the current branch tracks the protected branch.
if [ "$#" -eq 0 ]; then
  if UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
    case "$UPSTREAM" in
      */"$PB"|"$PB") echo "BLOCKED: current branch tracks $UPSTREAM; cannot push to $PB directly. Open a PR." >&2; exit 2 ;;
    esac
  fi
fi
exit 0
