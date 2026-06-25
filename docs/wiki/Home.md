# <Product> — Documentation

**Single source of truth for all <Product> documentation.** Docs live in **`docs/wiki/`** in this repo (PR-reviewed, versioned with the code) and are **published to this GitHub Wiki automatically** on merge to the default branch. End-user content is **synced downstream** from here into other systems.

## How this is organized
- **Technical documentation — English** (the development language).
- **User documentation — Deutsch + English.**
- Navigation: see the **sidebar** →

## Conventions
- **`docs/wiki/` in the repo is the source of truth** — this GitHub Wiki is a generated, read-only mirror. **Don't edit wiki pages directly** (the next sync overwrites them); edit `docs/wiki/**` via a pull request.
- Don't duplicate doc bodies in the task tracker (GitHub Projects) — that holds *tasks*, not docs.
- **Agent-runtime instructions stay in the repo** (`CLAUDE.md` / `AGENTS.md` / `docs/agents/`) and stay slim; they point here for depth.
- Page naming: technical = `Topic`; user docs = `User Guide (EN): Topic` / `Benutzerhandbuch (DE): Thema`. Images under `docs/wiki/assets/`.
