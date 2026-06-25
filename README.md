# apps3k workflow-template

Canonical, **single source of truth** for the apps3k common development workflow
("Projektmigration Mai 2026"). Every active apps3k repo converges on this standard;
the reusable building blocks live here and are copied + adapted per repo.

> **Maintenance policy.** This repo is the source. When a rule or file changes
> here, propagate it to the adopting repos (and update the docs in the same
> change). Keep this README and `docs/ADOPTION.md` in sync — out-of-date template
> docs are worse than none.

## The standard

1. **Org** `github.com/apps3k-com`.
2. **Branching:** main-only. `feature/<scope>` from `main` → PR to `main`. No
   dev/staging/preview branches. `staging`/`production` are GitHub Environments.
3. **Versioning:** `release-please` on `main` (versions, changelog, tags, releases).
4. **Feature flags:** GrowthBook — central abstraction, ENV-only config, safe
   defaults, ≥1 real flag, tested on/off/unavailable. Production deploy ≠ activation.
5. **Secrets:** `.env` via 1Password — **exactly one** repo-scoped
   `OP_SERVICE_ACCOUNT_TOKEN` per repo (least privilege); never in code/logs/memory.
   See [`docs/agents/secrets.md`](docs/agents/secrets.md).
6. **Agent instructions:** `AGENTS.md` (canonical, lean) + `CLAUDE.md` (imports it
   via `@AGENTS.md`); detail overflows to `docs/agents/*`. Same effect for Claude
   Code and Codex.
7. **Enforcement hooks:** provider-neutral `.claude/hooks/*` wired from both
   `.claude/settings.json` and `.codex/hooks.json`.
8. **Review:** CodeRabbit reviews PRs to `main`, configured at **org level** (apps3k org
   settings); repos ship **no** `.coderabbit.yaml` unless a deliberate, selective override.
9. **Project management:** GitHub Projects (org Project) — issues + native sub-issues;
   the PR links its issue (`Closes #N`). See [`docs/github-projects.md`](docs/github-projects.md).
10. **Quality gate:** docstring coverage ≥ 80 % (`scripts/docstring-coverage.mjs`).

## What's in here

| Path | Purpose |
|---|---|
| `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release-please.yml` | release-please (single-package node default; see ADOPTION for monorepo/subdir/non-node) |
| `.github/workflows/ci.yml` | PR gate: typecheck → tests → docstring-coverage (Bun default; swap per package manager) |
| `.claude/hooks/*.sh`, `.claude/settings.json`, `.codex/hooks.json` | Provider-neutral workflow hooks (block via exit 2 + stderr → Claude **and** Codex) |
| `AGENTS.md`, `CLAUDE.md`, `docs/agents/` | Lean agent instructions + overflow pattern |
| `docs/feature-flags.md`, `templates/feature-flags/*.ts` | GrowthBook abstraction (server + client) |
| `docs/github-projects.md`, `templates/github/labels.yml`, `scripts/github/*.mjs`, `.github/workflows/project-epic-sync.yml` | GitHub Projects taxonomy + label sync + Epic↔sub-issue automation |
| `scripts/docstring-coverage.mjs` | Docstring-coverage gate (TypeScript compiler API) |
| `.env.example`, `docs/agents/secrets.md` | The one-`OP_SERVICE_ACCOUNT_TOKEN`-per-repo secrets standard + 1Password local-env-file mechanics |
| `docs/ADOPTION.md` | Step-by-step per-repo adoption checklist |

> **Actions are disabled on this repo.** It ships templates, not an app — the
> `.github/workflows/*` here are copy-paste sources that would otherwise fail
> against this repo (no `package.json`). CodeRabbit (a GitHub App, not Actions)
> still reviews PRs here. Adopting repos enable Actions normally.

## Hook configuration

Hooks read env (with defaults): `PROTECTED_BRANCH` (default `main`),
`WORKFLOW_REQUIRE_ISSUE_REF` (default `true`). The latter is read only by
`pr-validate.sh`: it requires the PR body to link its issue with a closing keyword
(`Closes`/`Fixes`/`Resolves` `#N`); only an inline `--body`/`-b` is inspected (file/editor
bodies fall through to a reminder); set `false` to drop the check. The hooks block direct
commit/push/merge to the protected branch, force pushes and `gh pr merge`, and inject the
workflow rules at session start. After a PR is opened they make the **CodeRabbit loop
mandatory** — `pr-coderabbit-loop.sh` (reminder on `gh pr create`) plus a Stop guard
`coderabbit-loop-guard.sh` that blocks finishing while the branch's PR has unreviewed or
unresolved CodeRabbit feedback (fail-open; escape with `WORKFLOW_SKIP_CR_LOOP=1`).

## CodeRabbit — org-level config

CodeRabbit is configured **once at the org level** (apps3k org settings) and applies to
every repo. **Repos do not ship a `.coderabbit.yaml`** — a repo-level file overrides the
org config, so add one only as a deliberate, selective override.

If you ever add an override, note: an invalid key makes CodeRabbit **silently fall back to
defaults** (the whole file is ignored) — validate against the official schema. Common
mistakes: `tools`/`path_instructions` belong under `reviews` (not top-level);
`auto_review.base_branches` (not `branches`); `tone_instructions` ≤ 250 chars;
`knowledge_base.learnings` has only `scope`; `pre_merge_checks.description` has only
`mode` (use `custom_checks` for custom rules).

## Adopting

See [`docs/ADOPTION.md`](docs/ADOPTION.md). Reference instance: **apps3k-website**
(the pilot), validated end-to-end (CI green, CodeRabbit active, GrowthBook wired).
