# Workflow control panel

`/workflows` is Orchid's internal view of the GitHub-to-Plane workflow bridge. It displays only
bridge-returned evidence; Orchid never evaluates a Plane status or writes Plane itself.

Configure these server-only values through the normal 1Password-backed environment process:

- `WORKFLOW_BRIDGE_URL` — fixed bridge origin, without `/api/v1`.
- `BRIDGE_READ_TOKEN` — permits profile, delivery, and simulation requests.
- `BRIDGE_OPERATOR_TOKEN` — required only for an explicit reconciliation with `apply=true`.
- `ORCHID_WORKFLOW_ADMINS` — comma-separated GitHub logins allowed to use this screen.
- `WORKFLOW_INFRA_REPOSITORY` — managed `owner/name` of the infrastructure repository holding
  `configs/plane-github/config.json`.

The UI sends every bridge call from the server, so no browser receives a bridge token. Simulation
uses live mappings and returns a proposed binding plus a downloadable playbook. Opening a profile
configuration PR re-simulates the profile, reads the configured infra repo's default-branch config,
replaces only the matching repository binding, preserves `todoDispatch` and other bindings, and
requires one exact primary `Closes PREFIX-N` reference. It never activates a profile directly.
