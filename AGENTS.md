# AGENTS.md — <REPO>

> **No hallucination.** Every assumption, plan, review and diagnosis is verified
> against the real codebase, the live database and connected third-party systems —
> never guessed. If a source is missing, **ask** instead of inventing.

<REPO> — <one line: stack, runtime, deploy target>. Repo: `apps3k-com/<REPO>`.

## Core rules (apps3k common workflow)

- **Language:** chat with the user = German. Code, comments, commits, PRs = English.
- **Memory:** only **apps3k-memory** (`https://mcp-auth.apps3k.com/mcp/apps3k-memory`).
  Search it before any work; if a memory references a GitHub issue, read it. Store
  after each step. If the MCP is down, tell the user, cache memories and add them
  later. Never store secrets (only 1Password paths).
- **Diagnose before assuming:** use the available tools (Sentry, Grafana, Uptime
  Kuma, PostHog, Loki, Inngest …) before claiming a cause.
- **Never** merge a PR to `main` or deploy production yourself. **Never** delete or
  modify data on production systems.
- **Hooks enforce this workflow:** Claude → `.claude/hooks/`, Codex → `.codex/hooks/`.

## Git workflow (main-only)

- One long-lived branch: **`main`**. Short-lived `feature/<scope>` (or `fix/`,
  `chore/`, `docs/`) branch from `main`; the PR targets `main`.
- `staging`/`production` are **GitHub Environments** (not Git branches). Deployment
  is the platform's job; feature visibility is GrowthBook's.
- **Project management:** GitHub Projects (org Project) with issues + native
  sub-issues. **Conventional Commits**; the PR links its issue with a closing keyword
  (`Closes #N`). Taxonomy/automation: `docs/github-projects.md`.
- **Self-review before a PR:** fix every issue found — including ones from earlier
  steps, not just the current diff. Orchestrate a code-review agent where possible.
- **CodeRabbit** (configured at **org level**; no repo `.coderabbit.yaml` unless a
  deliberate, selective override — an invalid key is silently ignored, so validate it)
  reviews PRs against `main`: 15-min monitor,
  extend in 5-min steps, `@coderabbitai full review` if stalled; implement valid
  feedback + confirm, reject invalid feedback with reasoning, always mention
  `@coderabbitai`; push valid learnings to apps3k-memory. This loop is **mandatory and
  hook-enforced**: the Stop guard `coderabbit-loop-guard.sh` blocks finishing while a PR
  has unreviewed/unresolved CodeRabbit feedback — **no PR without the CodeRabbit loop**.
- **release-please** owns versioning/changelog/tags; the README is kept current at
  every release. Production deploys only on a release.
- **Docstring coverage >= 80%.**
- The PR to `main` is merged by the owner, not the agent.

## Commands (<app dir>)

- `<dev / dev:env>` · `<build>` · `<check / typecheck>` · `<test>` ·
  `<docstring:coverage>`

## Detail references (read on demand — do not duplicate here)

| Topic | File |
|---|---|
| Stack/domain detail | `docs/agents/*.md` |
| Secrets & 1Password | `docs/agents/secrets.md` |
| Feature flags (GrowthBook) | `docs/feature-flags.md` |
| Project mgmt (GitHub Projects, labels, Epics) | `docs/github-projects.md` |
