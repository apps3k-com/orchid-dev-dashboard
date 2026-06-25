# Adoption checklist (per repo)

Bring a repo onto the apps3k common workflow. Order matters where noted; each step
is a small PR against the repo's default branch (or the new `main`).

## 0. Prerequisites
- [ ] Repo is in the `apps3k-com` org (transfer needs `gh auth refresh -s admin:org`).
- [ ] **1Password:** a repo-scoped service account exists (read on **only** this repo's vault(s), least privilege); copy `.env.example`, and put **exactly one** variable — `OP_SERVICE_ACCOUNT_TOKEN` — in the repo's `.env` (a 1Password local-env-file). See [`docs/agents/secrets.md`](agents/secrets.md).
- [ ] GrowthBook SDK connections exist for the repo (`<repo>-development|staging|production`); keys in 1Password.

## 1. main-only branching (coordinated with deploy)
- [ ] Rename the default branch to `main` (`gh api -X POST repos/<org>/<repo>/branches/<old>/rename -f new_name=main`).
- [ ] Update the deploy platform to watch `main` (Coolify `git_branch`, Oxygen, Fly, CF) — **do this together with the rename so auto-deploy doesn't break.**
- [ ] Branch-protection/ruleset on `main` (PR required); drop obsolete rulesets.

## 2. release-please
- [ ] Copy `release-please-config.json` + `.release-please-manifest.json` + `.github/workflows/release-please.yml`.
- [ ] Set the package path + version. **Monorepo / app in a subdir:** use the app dir as the package path; `changelog-path` is RELATIVE to it (move/keep the CHANGELOG inside the package dir). **Non-node:** change `release-type`.

## 3. CI gate
- [ ] Copy `.github/workflows/ci.yml`; set `working-directory` (app dir) and the package manager; keep the gates: typecheck/lint, tests, `docstring:coverage`.
- [ ] Copy `scripts/docstring-coverage.mjs`; add `test` + `docstring:coverage` scripts; document exported API until coverage ≥ 80 %.

## 4. CodeRabbit
- [ ] CodeRabbit is configured at **org level** (apps3k org settings) — do **not** add a repo `.coderabbit.yaml`. Add one only as a deliberate, selective override (then validate against the official schema; see README).
- [ ] Ensure the CodeRabbit GitHub App is installed on `apps3k-com`.

## 5. Agent instructions
- [ ] Make `AGENTS.md` canonical (lean, ≤100–150 lines); `CLAUDE.md` imports it via `@AGENTS.md`.
- [ ] Move stack/domain detail to `docs/agents/*`; fill the references table.

## 6. Enforcement hooks
- [ ] Copy `.claude/hooks/*`, `.claude/settings.json`, `.codex/hooks.json`.
- [ ] Un-ignore `.claude/settings.json` + `.claude/hooks/` in `.gitignore` if `.claude/` is ignored.
- [ ] Keep `WORKFLOW_REQUIRE_ISSUE_REF=true` (the PR must link its issue via `Closes #N`); `chmod +x` the hooks; then smoke-test (before step 7): `bash .claude/hooks/guard-tests.sh` must print `ALL GUARD TESTS PASSED` — it exercises the branch/commit/push/merge/PR guards incl. issue-ref enforcement. If it fails, review the output and check `PROTECTED_BRANCH` / `WORKFLOW_REQUIRE_ISSUE_REF`.
- [ ] The hooks enforce the **CodeRabbit loop** after every PR: `coderabbit-loop-guard.sh` (Stop) blocks finishing while the branch's PR has unreviewed/unresolved CodeRabbit feedback, and `pr-coderabbit-loop.sh` (PostToolUse) reminds on `gh pr create`. Needs `gh` authenticated (fail-open otherwise); escape with `WORKFLOW_SKIP_CR_LOOP=1`.

## 7. GrowthBook
- [ ] Install the official SDK; copy the right abstraction (`server` or `client`) into the central flag layer.
- [ ] Add a real/test flag + tests (on/off/unavailable); add `docs/feature-flags.md`, link it from the README; set `GROWTHBOOK_*` env (public prefix for client builds).

## 8. GitHub Projects
> The three items are independent. The GitHub App (last item) is a one-time **org-level** resource shared by all repos — set it up once; afterwards only the per-repo `vars` change.
- [ ] Add the repo to the org Project; enable the built-in workflows (auto-add → `Backlog`; item closed / PR merged → `Done`). See [`docs/github-projects.md`](github-projects.md).
- [ ] Labels: edit `templates/github/labels.yml` (the `module:*` list for this system), then `node scripts/github/labels-sync.mjs --apply` (add `--prune --yes` to remove non-canonical labels).
- [ ] Epic↔sub-issue sync: install the GitHub App (Issues:RW + Projects:RW); set `vars.PROJECT_OWNER`, `vars.PROJECT_NUMBER`, `vars.PROJECT_SYNC_APP_ID`, `secrets.PROJECT_SYNC_APP_PRIVATE_KEY`; copy `.github/workflows/project-epic-sync.yml`.

## 9. Finish
- [ ] The PR links its issue via `Closes #N`; open the PR to `main`, run the CodeRabbit loop, hand off for merge (the owner merges).
- [ ] Update memory (apps3k-memory) per protocol.
