#!/usr/bin/env bash
# Smoke tests for the git guards. Runs each hook against a sample tool command (as the
# harness would feed it on stdin) and asserts the exit code (2 = blocked, 0 = allowed).
# Not wired into CI (CI runs Vitest); run manually: bash .claude/hooks/guard-tests.sh
#
# PROTECTED_BRANCH is set to the CURRENT branch so the "on the protected branch" guards
# (HEAD resolution, local merge) are exercised without having to be on `main`.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PB="$(git branch --show-current 2>/dev/null)"; PB="${PB:-main}"   # show-current is empty (not an error) in detached HEAD
export PROTECTED_BRANCH="$PB"
# Isolate from any ambient workflow env so results are deterministic: PR base then
# defaults to PB, and the issue-ref check uses its default (required).
unset WORKFLOW_PR_BASES WORKFLOW_REQUIRE_ISSUE_REF 2>/dev/null || true
fail=0

# check <hook> <expected-exit> <command> <label>
check() {
  local hook="$1" want="$2" cmd="$3" label="$4" got
  printf '{"tool_input":{"command":%s}}' "$(printf '%s' "$cmd" | jq -Rs .)" \
    | bash "$DIR/$hook" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    printf '  ok   [%s] %s (exit %s)\n' "$hook" "$label" "$got"
  else
    printf '  FAIL [%s] %s — expected exit %s, got %s\n' "$hook" "$label" "$want" "$got"
    fail=1
  fi
}

echo "PROTECTED_BRANCH=$PB"

# push-guard (2 = blocked)
check push-guard.sh 2 "git push origin HEAD"          "push HEAD to protected (implicit dest, P1 fix)"
check push-guard.sh 2 "git push origin @"             "push @ to protected (implicit dest)"
check push-guard.sh 2 "git push origin $PB"           "push protected explicitly"
check push-guard.sh 2 "git push origin HEAD:$PB"      "push HEAD:protected"
check push-guard.sh 2 "git push --force origin topic" "force push"
check push-guard.sh 0 "git push origin some-feature"  "push a feature branch (allowed)"
check push-guard.sh 0 "git push origin HEAD:other"    "push HEAD to a non-protected branch (allowed)"
check push-guard.sh 2 "git -c k=v push origin HEAD"   "push HEAD behind -c global option"
check push-guard.sh 2 "git --git-dir .git push origin $PB" "push protected behind --git-dir value option"
check push-guard.sh 2 "git --no-pager push origin $PB"    "push protected behind --no-pager flag"
check push-guard.sh 0 "git --help push"                   "git --help push is informational, not a push (no false block)"
check push-guard.sh 2 "(git -c k=v push origin $PB)"      "push protected inside a subshell"
check push-guard.sh 2 " git push origin $PB"              "push protected with leading whitespace"
check push-guard.sh 2 "git push HEAD:$PB"                 "refspec-first (no remote) to protected — first token must not be shifted away (critical fix)"
check push-guard.sh 0 "git push HEAD:other-branch"        "refspec-first to a non-protected branch (allowed)"

# merge-guard (2 = blocked while on the protected branch)
check merge-guard.sh 2 "git merge feature"                "merge on protected"
check merge-guard.sh 2 "git -c user.name=x merge feature" "merge behind -c global option (P2 fix)"
check merge-guard.sh 2 "git -C . merge feature"           "merge behind -C global option (P2 fix)"
check merge-guard.sh 2 "git --git-dir .git merge feature" "merge behind --git-dir value option (P1 r2)"
check merge-guard.sh 0 "git --help merge"                 "git --help merge is informational, not a merge (no false block)"
check merge-guard.sh 2 "(git -c k=v merge feature)"       "merge protected inside a subshell"
check merge-guard.sh 2 " git merge feature"              "merge protected with leading whitespace"
check merge-guard.sh 0 "git merge --abort"               "merge --abort (allowed)"
check merge-guard.sh 2 "git merge --abort && git -c k=v merge feature/x" "abort then a real merge on protected still blocks (no --abort bypass)"
check merge-guard.sh 0 "git merge-base a b"              "merge-base is not a merge (allowed)"
check merge-guard.sh 0 "git commit -m \"document how git merge works\"" "quoted mention of 'git merge' is not a merge (no false block)"

# branch-name-guard (2 = rejected name, 0 = accepted)
check branch-name-guard.sh 0 "git checkout -b feature/x"  "prefixed branch (allowed)"
check branch-name-guard.sh 0 "git switch -c fix/y"        "prefixed branch via switch (allowed)"
check branch-name-guard.sh 2 "git checkout -b main"       "reserved name 'main' (blocked)"
check branch-name-guard.sh 2 "git checkout -b staging"    "reserved name 'staging' (blocked)"
check branch-name-guard.sh 2 "git branch hotfix"          "bare name without prefix (blocked)"
check branch-name-guard.sh 0 "git checkout -b release/v1.2.0" "semver release branch (allowed)"
check branch-name-guard.sh 2 "git checkout -b release/foo" "non-semver release branch (blocked)"
check branch-name-guard.sh 0 "git branch"                 "branch listing (no name, allowed)"
check branch-name-guard.sh 2 "git -c k=v checkout -b main" "reserved name behind -c global option (can't bypass)"
check branch-name-guard.sh 2 "git --git-dir .git switch -c staging" "reserved name behind --git-dir option (can't bypass)"

# commit-guard (2 = on the protected branch; pass-throughs = 0)
check commit-guard.sh 2 "git commit -m \"feat: x\""       "commit on protected (blocked)"
check commit-guard.sh 2 "git commit --amend --no-edit"    "amend on protected still blocked (protected check precedes amend pass-through)"
check commit-guard.sh 0 "git status"                      "not a commit (allowed)"
check commit-guard.sh 2 "git -c user.email=x commit -m \"feat: y\"" "commit behind -c global option can't bypass the protected check (P1)"
check commit-guard.sh 2 "git --git-dir .git commit -m \"feat: z\""  "commit behind --git-dir option can't bypass the protected check"
check commit-guard.sh 2 "git -cuser.email=x commit -m \"feat: g\"" "commit behind GLUED -c (no delimiter) can't bypass (cubic P0)"
check branch-name-guard.sh 2 "git -cfoo=bar checkout -b main" "reserved name behind glued -c can't bypass"
check push-guard.sh 2 "git -cfoo=bar push origin $PB"      "push to protected behind glued -c can't bypass"

# pr-validate (base must be allowed; PR body must link its issue via Closes #N)
check pr-validate.sh 0 "gh pr create --base $PB --title \"feat: x\" --body \"Closes #1\""  "body with closing keyword (allowed)"
check pr-validate.sh 2 "gh pr create --base $PB --title \"feat: x\" --body \"no link here\"" "inline body without an issue link (blocked)"
check pr-validate.sh 0 "gh pr create --base $PB --title \"feat: x\" --body \"Fixes #12 and refs #3\"" "Fixes keyword variant (allowed)"
check pr-validate.sh 2 "gh pr create --base $PB --title \"feat: x\""                       "no body at all — fail-closed (blocked)"
check pr-validate.sh 2 "gh pr create --base $PB --title \"feat: x\" -F /nonexistent-xyz.md" "body-file missing/unreadable — fail-closed (blocked)"
check pr-validate.sh 2 "gh pr create --base $PB --title \"feat: x\" --body \"\""           "empty inline body — fail-closed (blocked)"
check pr-validate.sh 2 "gh pr create --base $PB --title \"feat: x\" --body \"no link --body-file x\"" "the --body-file substring inside a body can't bypass (blocked)"
check pr-validate.sh 2 "gh pr create --base $PB --title \"feat: x\" --body \"prefixes #1\"" "partial word 'prefixes #1' != 'fixes #1' (blocked)"
crbf="$(mktemp)"; printf 'Body.\nCloses #7\n' > "$crbf"
check pr-validate.sh 0 "gh pr create --base $PB --title \"feat: x\" -F $crbf"               "body-file on disk with a closing keyword (allowed)"
rm -f "$crbf"
check pr-validate.sh 2 "gh pr create --base nope --title \"feat: x\" --body \"Closes #1\"" "disallowed base blocked even with a valid body (blocked)"
check pr-validate.sh 2 "gh --repo o/r pr create --base nope --title \"x\" --body \"Closes #1\"" "gh global flag can't bypass base check (blocked)"
check pr-validate.sh 2 "gh -Ro/r pr create --base nope --title \"x\" --body \"Closes #1\"" "glued -Ro/r short flag can't bypass base check (blocked)"
check pr-validate.sh 0 "gh pr view 9"                                        "gh pr view is not create (allowed)"
check pr-validate.sh 2 "gh pr -R o/r create --base nope --title \"x\" --body \"Closes #1\"" "flag AFTER pr (gh pr -R o/r create) still base-checked (blocked)"
check pr-validate.sh 2 "gh --repo=o/r pr create --base nope --title \"x\" --body \"Closes #1\"" "= form before pr (gh --repo=o/r pr create) (blocked)"
check pr-validate.sh 2 "gh pr -R=o/r create --base nope --title \"x\" --body \"Closes #1\"" "= form AFTER pr (gh pr -R=o/r create) (blocked)"
check pr-validate.sh 2 "gh pr view 1 && gh -Ro/r pr create --base nope --title \"x\" --body \"Closes #1\"" "chained: the 2nd 'gh pr create' segment is still checked (global normalize)"

# pr-validate: `gh pr new` is a hidden alias for `gh pr create` — must be validated too
check pr-validate.sh 2 "gh pr new --base nope --title \"x\" --body \"Closes #1\"" "gh pr new disallowed base (blocked)"
check pr-validate.sh 0 "gh pr new --base $PB --title \"x\" --body \"Closes #1\"" "gh pr new allowed base + Closes (allowed)"
check pr-validate.sh 2 "gh pr new --base $PB --title \"x\" --body \"no ref\"" "gh pr new inline body without issue link (blocked)"
check pr-validate.sh 0 "gh pr comment 9 --body \"see the gh pr create docs\"" "quoted mention of 'gh pr create' is not a create (no false block)"
check pr-validate.sh 2 "gh pr new --base $PB --title \"x\" --body \"Closes #12abc\"" "malformed issue ref '#12abc' rejected (trailing boundary)"
check pr-validate.sh 0 "gh pr new --base $PB --title \"x\" --body \"Closes #12.\"" "valid issue ref then punctuation is accepted (allowed)"

# pr-validate multi-line --body (perl slurp; a line-based grep would only see line 1)
ml_ok=$'gh pr create --base '"$PB"$' --title "x" --body "intro line\nCloses #5"'
check pr-validate.sh 0 "$ml_ok" "multi-line --body with Closes on a later line (allowed)"
ml_bad=$'gh pr create --base '"$PB"$' --title "x" --body "intro line\nno issue reference"'
check pr-validate.sh 2 "$ml_bad" "multi-line --body without an issue link (blocked)"

# pr-merge-guard (the agent never merges; 2 = blocked)
check pr-merge-guard.sh 2 "gh pr merge 9 --squash"        "gh pr merge (blocked)"
check pr-merge-guard.sh 2 "gh --repo o/r pr merge 9"      "gh global flag can't bypass merge guard (blocked)"
check pr-merge-guard.sh 2 "gh -Ro/r pr merge 9"          "glued -Ro/r short flag can't bypass merge guard (blocked)"
check pr-merge-guard.sh 2 "gh pr view 1 && gh -Ro/r pr merge 9" "chained: the 2nd 'gh pr merge' segment is still caught (global normalize)"
check pr-merge-guard.sh 2 "gh pr -R o/r merge 9"         "flag AFTER pr (gh pr -R o/r merge) can't bypass (blocked)"
check pr-merge-guard.sh 2 "gh pr -Ro/r merge 9"          "glued flag AFTER pr (gh pr -Ro/r merge) can't bypass (blocked)"
check pr-merge-guard.sh 2 "gh --repo=o/r pr merge 9"     "= form before pr (gh --repo=o/r pr merge) (blocked)"
check pr-merge-guard.sh 2 "gh pr -R=o/r merge 9"         "= form AFTER pr (gh pr -R=o/r merge) (blocked)"
check pr-merge-guard.sh 0 "gh pr create --base $PB --title \"x [AB-1]\"" "gh pr create is not merge (allowed)"
check pr-merge-guard.sh 0 "gh pr create --base $PB --title \"fix merge bug [AB-1]\"" "'merge' inside a create title is NOT a merge (no false block)"
check pr-merge-guard.sh 0 "gh pr view 9"                  "gh pr view is not merge (allowed)"
check pr-merge-guard.sh 0 "gh pr comment 9 --body \"how to gh pr merge\"" "quoted mention of 'gh pr merge' is not a merge (no false block)"

# pr-coderabbit-loop (PostToolUse): mandatory CodeRabbit-loop reminder after a PR is opened
if printf '{"tool_input":{"command":"gh pr create --base main"}}' | bash "$DIR/pr-coderabbit-loop.sh" | grep -q systemMessage; then
  echo "  ok   [pr-coderabbit-loop.sh] emits the CodeRabbit-loop reminder on gh pr create"
else echo "  FAIL [pr-coderabbit-loop.sh] no reminder on gh pr create"; fail=1; fi
if printf '{"tool_input":{"command":"gh pr new --base main"}}' | bash "$DIR/pr-coderabbit-loop.sh" | grep -q systemMessage; then
  echo "  ok   [pr-coderabbit-loop.sh] emits the CodeRabbit-loop reminder on gh pr new (alias)"
else echo "  FAIL [pr-coderabbit-loop.sh] no reminder on gh pr new"; fail=1; fi
if [ -z "$(printf '{"tool_input":{"command":"git status"}}' | bash "$DIR/pr-coderabbit-loop.sh")" ]; then
  echo "  ok   [pr-coderabbit-loop.sh] silent on a non-PR command"
else echo "  FAIL [pr-coderabbit-loop.sh] should be silent on a non-PR command"; fail=1; fi

# coderabbit-loop-guard (Stop): the safeguards must short-circuit to exit 0 (never trap)
if printf '{}' | WORKFLOW_SKIP_CR_LOOP=1 bash "$DIR/coderabbit-loop-guard.sh" >/dev/null 2>&1; then
  echo "  ok   [coderabbit-loop-guard.sh] WORKFLOW_SKIP_CR_LOOP=1 allows stop"; else echo "  FAIL [coderabbit-loop-guard.sh] skip escape"; fail=1; fi
if printf '{"stop_hook_active":true}' | bash "$DIR/coderabbit-loop-guard.sh" >/dev/null 2>&1; then
  echo "  ok   [coderabbit-loop-guard.sh] stop_hook_active allows stop (no infinite loop)"; else echo "  FAIL [coderabbit-loop-guard.sh] stop_hook_active guard"; fail=1; fi

if [ "$fail" -eq 0 ]; then echo "ALL GUARD TESTS PASSED"; else echo "SOME GUARD TESTS FAILED"; fi
exit "$fail"
