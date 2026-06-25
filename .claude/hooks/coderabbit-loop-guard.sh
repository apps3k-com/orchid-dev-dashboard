#!/usr/bin/env bash
# Stop — "no PR without the CodeRabbit loop". Block finishing while the current
# branch's OPEN PR still has pending (not-yet-reviewed) or UNRESOLVED CodeRabbit
# feedback. Provider-neutral: blocks via exit 2 + stderr (Claude Code + Codex).
#
# Safeguards (never trap a session):
#   - WORKFLOW_SKIP_CR_LOOP=1     explicit escape (owner hand-off).
#   - stop_hook_active            already continuing from a stop hook → allow.
#   - any missing tool / gh error / offline → fail-open (exit 0).
set -euo pipefail
[ "${WORKFLOW_SKIP_CR_LOOP:-}" = "1" ] && exit 0

STDIN=$(cat 2>/dev/null || echo '{}')
command -v jq >/dev/null 2>&1 || exit 0
# Avoid infinite stop loops: if we already blocked once this continuation, allow.
printf '%s' "$STDIN" | jq -e '.stop_hook_active == true' >/dev/null 2>&1 && exit 0
command -v gh >/dev/null 2>&1 || exit 0

PB="${PROTECTED_BRANCH:-main}"
BRANCH=$(git branch --show-current 2>/dev/null || echo "")
{ [ -z "$BRANCH" ] || [ "$BRANCH" = "$PB" ]; } && exit 0

REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || echo "")
[ -z "$REPO" ] && exit 0
OWNER="${REPO%%/*}"; NAME="${REPO##*/}"

PR=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
[ -z "$PR" ] && exit 0
URL="https://github.com/$REPO/pull/$PR"

# Has CodeRabbit posted a review or any comment yet?
# --paginate so a PR with >100 comments/reviews can't hide CodeRabbit's activity on a
# later page (a false "not reviewed yet" would wrongly trap the session). With --paginate
# the --jq filter runs per page, so awk sums the per-page counts. Each count is its OWN
# assignment with `|| exit 0`: under set -euo pipefail a failed gh/API call would make the
# substitution non-zero and abort the script (exit 1) instead of failing open — `|| exit 0`
# turns a transient API error into a clean "allow finish" rather than trapping the session.
comments_n=$(gh api --paginate "repos/$REPO/issues/$PR/comments" --jq '[.[]|select(.user.login=="coderabbitai[bot]")]|length' 2>/dev/null | awk '{s+=$1} END{print s+0}') || exit 0
reviews_n=$(gh api --paginate "repos/$REPO/pulls/$PR/reviews"  --jq '[.[]|select(.user.login=="coderabbitai[bot]")]|length' 2>/dev/null | awk '{s+=$1} END{print s+0}') || exit 0
if [ "$(( ${comments_n:-0} + ${reviews_n:-0} ))" -eq 0 ]; then
  echo "BLOCKED (CodeRabbit loop): $URL is open but CodeRabbit has not reviewed yet. Monitor the PR and run the loop before finishing. Escape: WORKFLOW_SKIP_CR_LOOP=1." >&2
  exit 2
fi

# Any UNRESOLVED CodeRabbit-authored review thread?
# --paginate (with pageInfo + $endCursor) so a PR with >100 review threads can't hide an
# unresolved CodeRabbit thread on a later page. --jq runs per page → awk sums the counts.
# `|| exit 0` fails open (allow finish) on any gh/API/pipefail error, same as the count above.
# shellcheck disable=SC2016  # $o/$r/$n/$endCursor are GraphQL variables — must NOT expand in the shell
unresolved=$(gh api graphql --paginate \
  -f query='query($o:String!,$r:String!,$n:Int!,$endCursor:String){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100,after:$endCursor){nodes{isResolved comments(first:1){nodes{author{login}}}} pageInfo{hasNextPage endCursor}}}}}' \
  -f o="$OWNER" -f r="$NAME" -F n="$PR" \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved==false)|select(.comments.nodes[0].author.login=="coderabbitai[bot]")]|length' 2>/dev/null \
  | awk '{s+=$1} END{print s+0}') || exit 0
if [ "${unresolved:-0}" -gt 0 ]; then
  echo "BLOCKED (CodeRabbit loop): $URL has $unresolved unresolved CodeRabbit thread(s). Fix or reject each with a reasoned reply (mention @coderabbitai) and resolve them before finishing. Escape: WORKFLOW_SKIP_CR_LOOP=1." >&2
  exit 2
fi
exit 0
