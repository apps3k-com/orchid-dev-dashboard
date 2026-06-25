# Documentation Standard — GitHub Wiki (via `docs/wiki/`)

Documentation lives in **`docs/wiki/` in each repo** — the source of truth, PR-reviewed
and versioned with the code — and is **auto-published to the repo's GitHub Wiki** by a
sync workflow. Adopted 2026-06 across apps3k repos.

## How it works

1. **Source = `docs/wiki/*.md`** in the main repo, edited via normal PRs (reviewed, CI-gated).
2. **`.github/workflows/wiki-sync.yml`** — on every merge to `main` touching `docs/wiki/**`,
   it `rsync --delete`s `docs/wiki/` onto the repo's `<repo>.wiki.git`.
3. **The GitHub Wiki is a generated, read-only mirror** — never edit it directly (the next
   sync overwrites it). It exists so docs render with wiki navigation + search.

Tool-agnostic (GitHub stays), versioned with the code, inside the PR-review discipline —
while still giving a browsable wiki.

## Why not edit the wiki directly?

The `.wiki.git` is a separate repo with no PR review or CI. Editing `docs/wiki/` via PR keeps
documentation under the same review + main-only flow as code. Agents edit `docs/wiki/` like
any other file — no special wiki tooling, no direct `.wiki.git` pushes.

## Languages

- **Technical docs → English** (the development language; matches code/identifiers).
- **User docs → Deutsch + English** (`User Guide (EN)` / `Benutzerhandbuch (DE)`).

## Structure (`docs/wiki/`)

`Home`, `_Sidebar` (navigation), `_Footer` + (templates ship in this repo's `docs/wiki/`):

| Group | Pages |
|---|---|
| 📘 User Documentation | `User Guide (EN)`, `Benutzerhandbuch (DE)` — one sub-page per feature, with screenshots. **User-facing products only.** |
| 🔧 Technical (EN) | `Architecture`, `Data Model`, `Development Setup`, `Conventions`, `Deployment & Environments`, `Integrations`, `Runbooks`, `ADRs`, `Release Notes` (+ repo-specific). **Create only the pages that apply.** |

**Naming:** technical = `Topic`; user docs = `User Guide (EN): <Topic>` / `Benutzerhandbuch (DE): <Thema>`. Images under `docs/wiki/assets/`.

## Bootstrapping a repo

1. Copy `docs/wiki/` + `.github/workflows/wiki-sync.yml` from this template; fill the pages (replace `<Product>`), scaled to the repo.
2. **Enable the wiki + create the first page in the GitHub UI** — one-time, required: the
   `.wiki.git` is created lazily and the sync action's `git clone` fails until a page exists.
3. Open a PR with `docs/wiki/`; on merge to `main`, the action publishes to the wiki.

## Gotchas

- **Never edit the GitHub Wiki directly** — `docs/wiki/` is the source; direct edits are overwritten on the next sync.
- The wiki must be **initialized once via the UI** (first page) or the sync action's clone fails ("Repository not found").
- Wiki visibility = repo visibility (private repo → collaborator-only); publish end-user docs downstream for external readers.
