# GitHub-App einrichten

Orchid braucht **eine GitHub-App pro Self-Hoster**. Sie liefert zwei Dinge:

- **Daten- und Schreibzugriff** über Installations-Tokens (Repos/PRs/Projects lesen; Module & Automationen als **PR** schreiben — nie direkt auf den Default-Branch).
- **Login** über die GitHub-OAuth (User-Authorization) **derselben** App, beschränkt auf Mitglieder der verwalteten Org(s).

Es gibt zwei Wege:

- **Ein-Klick (empfohlen, sobald die App läuft):** `/setup` postet ein vorbereitetes **Manifest** an GitHub und legt die App mit allen korrekten Settings an. Quelle: [`src/server/github/manifest.ts`](https://github.com/apps3k-com/orchid-dev-dashboard/blob/main/src/server/github/manifest.ts).
- **Manuell:** diese Seite — nötig, wenn du die App **vor** dem ersten Start brauchst (z. B. um `.env` zu füllen).

> In diesem Dokument ist `<APP_URL>` die öffentliche Basis-URL deiner Instanz: lokal `http://localhost:3000`, produktiv z. B. `https://orchid.apps3k.com`.

## Wo anlegen — Org vs. persönlich

Die App muss dort **installierbar** sein, **wo die zu verwaltenden Repos liegen**.

- **Org-Repos** (z. B. `apps3k-com/*`): App **unter der Org** anlegen → `https://github.com/organizations/<ORG>/settings/apps/new`. Dann ist „Only on this account" = die Org.
- **Persönlich angelegte App:** unter *Where can this App be installed?* **„Any account"** wählen, sonst lässt sie sich nicht auf der Org installieren.

## Formular „Create GitHub App"

| Feld | Wert | Hinweis |
|---|---|---|
| **GitHub App name** | z. B. `Orchid Dev Dashboard` | global eindeutig auf GitHub |
| **Homepage URL** | `<APP_URL>` | muss nur gültig sein |
| **Callback URL** | `<APP_URL>/api/auth/callback` | **kritisch** für den OAuth-Login. Über „Add Callback URL" können mehrere hinterlegt werden (z. B. lokal **und** produktiv). |
| **Expire user authorization tokens** | **an** | liefert einen `refresh_token` |
| **Request user authorization (OAuth) during installation** | aus | Manifest: `request_oauth_on_install: false` |
| **Enable Device Flow** | aus | |
| **Setup URL (optional)** | `<APP_URL>/setup/callback` | Post-Install-Redirect (Manifest: `redirect_url`) |
| **Webhook → Active** | **aus** | v1 verarbeitet keine Webhooks (Ingest = v2); abgehakt entfällt die sonst verpflichtende Webhook-URL |
| **Where can this App be installed?** | „Only on this account" (Org-App) bzw. „Any account" (persönlich) | s. o. |

## Permissions

**Repository permissions**

| Permission | Stufe |
|---|---|
| Contents | Read and write |
| Issues | Read and write |
| Metadata | Read-only *(Pflicht, automatisch)* |
| Pull requests | Read and write |
| Variables | Read and write |

**Organization permissions**

| Permission | Stufe |
|---|---|
| Members | Read-only |
| Projects | Read and write |
| Secrets | Read and write |
| Variables | Read and write |

**Account permissions:** keine. **Subscribe to events:** keine (Webhook aus).

**Wofür:** Repo-`Contents`/`Pull requests` (RW) → Audit-Fix-PRs + Module-Editor; `Issues` (RW) → Sync + Closing-Keywords; repo-`Variables` (RW) → Automations-Recipe-Repo-Vars; org-`Variables` (RW) → die org-weite `PRODUCTS`-Variable (`PATCH /orgs/{org}/actions/variables`); `Secrets` (RW) → Automations-Provisioning; `Projects` (RW) → Projects-Sync/-Board; `Members` (RO) → gated Login + Org-Mitgliedschaftsprüfung; `Metadata` (RO) → Pflicht.

> **Minimal nur für einen Audit-Lauf:** Metadata (RO) + Contents (RW) + Pull requests (RW) + Members (RO). Alles Übrige braucht der volle Cockpit-/Automations-/Products-Flow — für die „optimale" App also alle setzen.

## Nach dem Erstellen

1. **Generate a private key** → lädt eine `.pem` herunter → `GITHUB_APP_PRIVATE_KEY`.
2. **App ID** (oben auf der App-Seite) → `GITHUB_APP_ID`.
3. **Client ID** → `GITHUB_APP_CLIENT_ID`; **Generate a new client secret** → `GITHUB_APP_CLIENT_SECRET`.
4. **Install App** (linke Navigation) → auf der/den Ziel-Org(s) installieren; Repo-Zugriff = *All repositories* oder gezielt (z. B. die zu auditierenden Repos).

## `.env`-Zuordnung

| GitHub | `.env` |
|---|---|
| App ID | `GITHUB_APP_ID` |
| Private key (PEM) | `GITHUB_APP_PRIVATE_KEY` |
| Client ID | `GITHUB_APP_CLIENT_ID` |
| Client secret | `GITHUB_APP_CLIENT_SECRET` |
| Webhook secret *(erst v2)* | `GITHUB_APP_WEBHOOK_SECRET` |

Zusätzlich: `APP_URL=<APP_URL>` · `SESSION_SECRET` (`openssl rand -base64 32`) · optional `APP_ENCRYPTION_KEY` (sonst Fallback auf `SESSION_SECRET`) · `ORCHID_LLM_ADMINS=<github-logins>` (kommasepariert; nötig für den BYOK-Auditor). Im Docker-Bundle setzt `docker-compose.yml` die `DATABASE_URL` selbst.

> **PEM mehrzeilig:** Der Private Key umfasst mehrere Zeilen. Im Docker-`env_file` am einfachsten als 1Password-`local-env-file` (FIFO) auflösen (siehe `docs/agents/secrets.md`) oder den PEM-Inhalt mit `\n`-escapten Zeilen einzeilig hinterlegen.

## Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| Login bricht mit Redirect-Fehler ab | Callback-URL der App muss exakt `<APP_URL>/api/auth/callback` enthalten |
| `/repos` ist leer | App nicht auf der Org installiert bzw. ohne Repo-Zugriff → der Sync findet nichts |
| 403 im Products-Editor | org-`Variables` (write) fehlt |
| Audit „Only an LLM admin can run audits." | `ORCHID_LLM_ADMINS` enthält deinen GitHub-Login nicht |

> Der Ein-Klick-`/setup`-Pfad setzt diese Permissions automatisch (Quelle: `manifest.ts`).
