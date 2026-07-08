# Orchid 2.0 — The Solo-Dev Mission Control (Concept)

> Status: **approved concept / roadmap** (owner-approved 2026-07-08). Owner decisions:
> **internal-first, product-ready** · **agent role: both tiers evaluated** (recommendation below) ·
> priorities: **1) agent overview & dispatch, 2) planning/spec → issues, 3) deploy & monitoring**
> (MCP & spend follow later). Research basis: 5 parallel research agents (codebase inventory,
> pain points/competitive landscape, ops/monitoring APIs, planning/Obot/agent-dispatch APIs,
> shadcnstudio block catalog). State of the world: mid-2026.

## Context — why this expansion

Orchid today is a solid **GitHub cache cockpit**: dashboard, PRs, projects (read-only boards),
repos, LLM fleet audits (BYOK Anthropic, cost guard, fix PRs), hooks drift with diff + confirm,
compliance (tier 0), automation recipes, products/modules taxonomy. Architectural pattern:
GitHub = source of truth, Orchid = cache + control plane, **writeback via PR only**
(`proposeFiles`), 5-minute polling, no webhook receiver, and no deploy / monitoring / agent /
MCP / spend view (verified by inventory).

The 2026 solo-dev bottleneck has moved: **not code generation, but the human as the
review/decision gate for N parallel agents** across ~10 repos. Research shows a clear market
gap: there are local execution tools (Conductor, Vibe Kanban (discontinued 2026, see below),
claude-squad), single-vendor clouds (GitHub Agent HQ/Copilot, Claude Code Web, Factory),
review (CodeRabbit), deploy (Coolify), MCP governance (Obot) — but **nobody connects plan →
dispatch → review → deploy → monitor cross-vendor, self-hosted, and GitHub-native**. Two
indie attempts (Terragon, Bloop/Vibe Kanban) shut down in 2026; the niche is open, not
crowded.

**Positioning: "Coolify for AI agents" — the self-hosted, GitHub-native mission control for
solo devs (later: small teams).**

## Pain points → Orchid's answer (research digest)

| # | Pain (evidenced) | Orchid's answer | Pillar |
|---|---|---|---|
| 1 | Review/merge gate: one human gates N agents | Decision Queue: everything decision-ready in one place, one-click actions | P1 |
| 2 | Lost overview across repos/agents/PRs | Command Center + cross-vendor AgentTask tracking | P1/P3 |
| 3 | Worktree/session chaos under parallelism | Tier 1: cloud dispatch (no local chaos); tier 2 runner later | P3 |
| 4/5 | Context/memory fragmentation, rework | Spec fabric + AGENTS.md governance (hooks-drift feature extended) | P2/P5 |
| 6 | Spend opacity (subs + API, 3 providers) | Spend aggregation + per-task attribution | P5 |
| 7 | Spec→implementation handoff quality | Spec → epic → sub-issues sync, "agent-ready issue" linting | P2 |
| 8 | Agent observability ("what did it do?") | Session timeline per AgentTask (Actions/Tasks APIs) | P3 |
| 9 | Guardrail/permission drift across repos | Fleet drift for `.claude/`, `.mcp.json`, permissions (hooks feature++) | P5 |
| 10 | Notification overload, "what needs ME?" | Prioritized Decision Queue instead of channel noise | P1 |
| — | Shopify: API fall-forward, webhook health, review checks | Lifecycle cards per Shopify app | P4 |

## Product pillars

### P1 — Command Center (new home page)

**Decision Queue**: aggregates everything that needs a human decision, prioritized: agent
`waiting_for_user` / finished agent PRs, failing checks, unresolved CodeRabbit threads, deploy
failures, critical incidents, open audit findings with a fix-PR offer, Shopify deadlines. Each
item: context snippet + one-click action (open, dispatch, confirm, dismiss). Plus a fleet
snapshot (health grade per app) and an activity feed. **This is the differentiator — GitHub
Mission Control only does this inside GitHub; nobody does it cross-vendor + self-hosted.**

### P2 — Planning Studio (spec → issues)

GitHub stays the storage layer (issues, sub-issues, issue types, custom fields — all
API-capable). Orchid owns what the API does **not** expose (verified): **views** (no Views
API!), roadmap rendering, workflow automation, analytics. Concretely:

- **Spec sync**: spec files in the repo (spec-kit compatible, `specs/`) → Orchid generates an
  epic + sub-issues via the existing PR writeback (`proposeFiles`) plus **net-new** Issues-API
  integration (no Issues-API calls exist in `src/` today); drift detection spec ↔ issues.
- **Own boards/roadmap** over Projects data (extend the existing `/projects/[id]` board);
  cycle time/velocity from `projects_v2_item` webhooks (payload carries old + new field values).
- **Agent-ready-issue check**: short, well-scoped issues with context hints (research finding)
  — a linter before dispatch.

### P3 — Agent Operations (priority 1)

**Agent-role recommendation (both tiers evaluated):**

- **Tier 1 (now): control & observation plane.** Dispatch + tracking via the vendors' APIs —
  no own runner, no worktree/sandbox operation, consistent with the PR-only security model:
  - **Claude Code Action** (workhorse, quality, self-hosted runners possible): dispatch =
    issue comment / `workflow_dispatch`; tracking via Actions runs/checks. Pin the version
    (≥ v1.0.94, CVE).
  - **Copilot coding agent** (most GitHub-native status API, `waiting_for_user` state!):
    dispatch = issue assignment / `POST /agents/…/tasks`; caveat: **user tokens only** (PAT),
    no app installation token.
  - **Cursor cloud agents** (best M2M API: REST + SSE + usage endpoint) as the programmatic
    option.
  - Codex: no clean public dispatch endpoint → observe only (PRs), do not drive.
- **Tier 2 (deliberately deferred): own runner** (local/server, worktrees, log streaming,
  sandboxing). Re-evaluate when: cloud dispatch limits hurt, local-only repos are needed, or
  live mid-session steering is required. Costs process management + security surface.

**AgentTask model**: provider, trigger (issue/manual), status, repo, issue/PR links, cost,
session log link. Feeds the Decision Queue (`waiting_for_user`, "PR ready").

### P4 — Delivery & fleet health (priority 3)

- **App catalog first** (Backstage lesson #1): `App` links repo ↔ Coolify app ↔ Shopify app ↔
  Sentry project ↔ uptime monitor. Aggregate + deep-link, rebuild nothing (lesson #2).
- **Coolify**: outbound webhook (deploy success/failure) → ingest; poll `/applications` +
  `/deployments` for reconciliation (API = perpetual beta, never trust push alone). Deploy
  trigger from Orchid (promote a release) as an action.
- **Signals**: Sentry integration-platform webhooks (issue/alert), Grafana alert webhook
  (covers Prometheus + Loki), Uptime Kuma webhook + `/metrics` (weakest API), Inngest
  failures, GitHub `deployment_status`/`release` (release-please). PostHog later
  (annotations first).
- **Incident loop**: signal → GitHub issue → agent dispatch (P3) → fix PR → merge (human!) →
  release-please → Coolify deploy → health check. Automatable end-to-end except the
  merge/deploy gate.
- **Shopify lifecycle cards** per app: pinned API version + fall-forward countdown, webhook
  delivery health (mandatory compliance topics!), Partner API events
  (installs/churn/revenue), deprecation-header log.

### P5 — Governance, MCP & spend (deferred)

- **Guardrail fleet drift**: extend the existing hooks-drift feature to `.mcp.json`,
  `settings.json` permissions, AGENTS.md — template vs repo with confirm (pattern exists).
- **MCP control plane via Obot**: bearer-token admin API (server list/add/configure/delete,
  audit logs, capacity). ⚠️ Docs are thin — verify endpoints against the own instance before
  building UI. Show: health, auth/key expiry, usage per server, catalog vs installed, which
  repos reference a server.
- **Spend**: own BYOK audit costs (exists per run) + provider usage APIs (Anthropic Admin,
  OpenAI Usage, Cursor `/usage`) + AgentTask attribution → cost per repo/task/week.
- Existing compliance/automations remain and dock here.

## Architecture evolution (product-ready, no big bang)

1. **Event spine instead of polling-only**: `POST /api/ingest/{source}` route handlers
   (HMAC verify, fast 200, enqueue into graphile-worker). Sources: **github** (the app
   webhook secret is already plumbed, just unused!), coolify, sentry, grafana, uptime-kuma,
   inngest. Polling remains as reconciliation (idempotency via `dedupeKey`).
2. **New core models** (Prisma, additive migrations — respect the naming convention,
   lexicographically after `repo_provider_keys_multi`): `Signal` (source, kind, severity,
   dedupeKey, payload), `DecisionItem`, `AgentTask`, `App`/`AppLink`, `Deployment`,
   `Incident`, `McpServer`, `SpendRecord`.
3. **Integration-module pattern** (Backstage lesson #5): every source = a self-contained
   module with its own health + last-success; one outage never blanks the whole board. New
   settings page `Integrations` (tokens encrypted like `ProviderKey`, AES-256-GCM exists).
4. **Product-ready decisions now (cheap), product later**: role field on `User` (eventually
   replaces env-only `ORCHID_LLM_ADMINS`), integrations configurable via UI instead of env,
   reuse the setup-wizard pattern (`/setup` exists), Docker standalone stays the deploy form.
   **No** multi-tenant, **no** billing now.
5. **Security model unchanged**: writeback via PR only (except sanctioned vars), merge/deploy
   stays human, secrets never in plaintext, new webhook endpoints with secret + replay
   protection.

## UX concept (shadcn/shadcnstudio exclusively)

Restructure navigation (sidebar, existing patterns):
**Command Center** (home) · **Plan** (projects/boards, specs) · **Build** (agents, pull
requests, audits) · **Operate** (apps/fleet, deployments, incidents) · **Govern** (hooks,
compliance, MCP, spend) · **Settings** (automations, products, AI providers, integrations).

**Verified block catalog** (researched live via the shadcn CLI against
@ss-blocks/@ss-components — use only these IDs, ★ = best fit):

| Surface | Verified blocks |
|---|---|
| Command Center | Shell pattern `@ss-blocks/application-shell-11`★ (timeline + notifications + tasks); Decision-Queue items custom from primitives + status badges `@ss-components/badge-16…21`★ (in-progress/blocked/completed/pending/failed/successful); inbox `@ss-blocks/dashboard-dropdown-12`★ or `@ss-components/popover-11`; fleet tiles `@ss-blocks/statistics-component-20/-22`★ (uptime/error-rate radial); feed `@ss-blocks/onboarding-feed-04`★ |
| Plan | Kanban: keep the existing custom `project-board.tsx` (the only registry kanban is embedded in `application-shell-14`, not standalone); project health `@ss-blocks/chart-component-43`; spec wizard `@ss-blocks/form-layout-08/-09`★ (Stepperize); hover context `@ss-components/tooltip-13` |
| Build/Agents | Run table: app DataTable or `@ss-components/data-table-13`★ (inline status/progress cells); session detail: `timeline` (installed) + `@ss-components/alert-09` (task progress) + `button-26` (promise button); presence `@ss-components/avatar-07/-08` + groups `avatar-13/16…`; latency `@ss-blocks/statistics-component-17`★ |
| Operate | Uptime tracker `@ss-blocks/chart-component-52/-53/-55`★ (on the `ui/tracker` primitive); pipeline/deploy `chart-component-54`★; release cadence `chart-component-48`; changelog `@ss-blocks/timeline-component-05`★; empty states `empty-state-01/-03/-05` |
| Govern/Spend | Quota cards `@ss-blocks/statistics-component-15`★; costs `chart-component-31/-46/-38`★; settings suites `@ss-blocks/account-settings-04` (integrations)/-06 (security)/-02 (notification prefs); later billing `-07`/`chart-component-49` |
| Global | Command palette: `command` primitive + pattern `application-shell-02`★; search dialog `dashboard-dialog-19`; new-integration dialog after the `dashboard-dialog-16` pattern (stepper) |

- Already installed: 21 ui primitives, DataTable (TanStack) + use-pagination, timeline,
  progress, statistics-card-03, empty-state-02, sidebar shell — keep using them.
- Base primitives still to install (dependencies of the blocks above): `command`, `chart`,
  `tabs`, `collapsible`, `accordion`, `hover-card`, `navigation-menu`, `input-group`,
  `ui/tracker`.
- **Confirmed registry gaps → build custom from primitives**: log/session viewer, terminal
  output, code/diff viewer (a custom line-diff already exists in hooks), Gantt/roadmap,
  AI chat panel, standalone kanban, calendar grid. Reuse `ui/tracker` as a status strip.

## Roadmap (phases = independently shippable increments; each phase = several small PRs with the CodeRabbit loop)

Phase↔pillar mapping (deliberately NOT sequential — phases follow the owner's priorities, not
the pillar numbers): **A → P1** (foundation) · **B → P3** (priority 1) · **C → P2**
(priority 2) · **D → P4** (priority 3) · **E → P5** (deferred).

**Phase A — event spine + Command Center v1** *(foundation for priority 1)*
Activate GitHub App webhooks (pull_request, issues, check_suite, deployment_status, release,
projects_v2_item) → ingest route + Signal model → Decision Queue v1 fed by GitHub signals,
the existing audit findings, and a **net-new** CodeRabbit-thread fetch (GraphQL
`reviewThreads` — nothing in `src/` queries review threads today). New home page.
*Immediate value: real-time instead of 5-minute polling, one "what needs me" feed.*

**Phase B — agent operations v1** *(priority 1)*
AgentTask model + dispatch: Claude Code Action (comment/workflow_dispatch) + Copilot
assignment (PAT setting) + optional Cursor API; status sync (Actions/Tasks APIs, Copilot
`waiting_for_user` → Decision Queue); session detail page (timeline, log links, cost).
Issue-→-agent button everywhere issues appear (boards, audit findings, incidents later).

**Phase C — planning studio** *(priority 2)*
Spec sync (`specs/` → epic + sub-issues via PR + API, drift badge), board expansion (own
views — there is no Views API), cycle analytics from `projects_v2_item` webhooks,
agent-ready-issue linter before dispatch.

**Phase D — fleet health** *(priority 3)*
App catalog + links, Coolify (webhook + poll, deploy history, deploy trigger), Sentry +
Grafana + Uptime Kuma ingest, Incident model + incident→issue→dispatch loop, Shopify
lifecycle cards (Partner API, version countdown, webhook health).

**Phase E — govern & spend + product hardening**
Obot MCP panel (after live API verification), spend dashboard (provider usage APIs +
attribution), guardrail-drift extension (`.mcp.json`/permissions), roles instead of env
admins, setup docs / one-line install — the basis for an OSS-release/product decision.

## Risks & guardrails

- **API instability**: Coolify beta (double up push + poll), Obot docs thin (verify live
  first), Copilot user-token-only (store the PAT properly), Uptime Kuma fragile → integration-
  module pattern with per-source health, each degrades individually.
- **Scope for a solo maintainer**: phases are individually valuable; stoppable after each
  phase. Never rebuild what Grafana/GitHub already render — aggregate + deep-link.
- **Security**: more secrets (Coolify/Sentry/Obot tokens) → store encrypted (pattern exists),
  webhook HMAC everywhere, agent dispatch never auto-merges, pin claude-code-action.
- **Cost**: agent dispatch creates real LLM cost → budget guards like the audit's
  `ORCHID_AUDIT_MAX_USD`.

## Verification (per phase)

Unit tests for pure mappers (signal normalization, queue prioritization — pattern: existing
`*.test.ts`), webhook ingest with fixture payloads, `pnpm check`/`test`/docstring gate, live
check against the real fleet (the own ~10 apps = perfect dogfooding), CodeRabbit loop per PR.

## Non-goals (deliberate)

No own agent runtime (tier 2 deferred), no Grafana/Loki rebuild, no GitHub-UI replacement,
no multi-tenant/billing now, no Codex dispatch integration (no clean API).

## Open (before each phase starts)

1. Concretize verified shadcnstudio block IDs per phase epic (rule: verified IDs only,
   shadcn CLI research always).
2. Verify the Obot admin API against the own instance (phase E gate).
3. Extend GitHub App permissions? (Webhook events + possibly `issues:write` may already
   suffice — check at phase A start; the manifest flow exists for reinstallation.)
