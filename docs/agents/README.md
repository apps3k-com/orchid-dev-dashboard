# docs/agents — instruction overflow

`AGENTS.md` (imported by `CLAUDE.md` via `@AGENTS.md`) stays lean and within the
provider limits:

- **CLAUDE.md:** max ~100 lines / 300–600 words.
- **AGENTS.md / Codex:** max ~100–150 lines.

Everything that exceeds those limits — stack specifics, schema/data-model notes,
domain rules, security/secrets detail — lives here as small, focused files that
agents read **on demand**, e.g.:

- `docs/agents/<domain>.md` (e.g. `directus.md`, `frontend.md`)
- `docs/agents/secrets.md` — 1Password paths + how to load them (never commit secrets)

Reference these files from the table at the bottom of `AGENTS.md`.
