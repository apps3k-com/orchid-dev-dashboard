# Workflow control panel

`/workflows` is Orchid's internal view of the GitHub-to-Plane workflow bridge. It displays only
bridge-returned evidence; Orchid never evaluates a Plane status or writes Plane itself.

Configure these server-only values through the normal 1Password-backed environment process:

- `WORKFLOW_BRIDGE_URL` — fixed bridge origin, without `/api/v1`.
- `BRIDGE_READ_TOKEN` — permits profile, delivery, and simulation requests.
- `BRIDGE_OPERATOR_TOKEN` — required for every explicit reconciliation, including `apply=false`.
- `ORCHID_WORKFLOW_ADMINS` — comma-separated GitHub logins allowed to use this screen.
- `WORKFLOW_INFRA_REPOSITORY` — managed `owner/name` of the infrastructure repository holding
  `configs/plane-github/config.json`.

The UI sends every bridge call from the server, so no browser receives a bridge token. Simulation
uses live mappings and returns a proposed binding plus a downloadable playbook. Opening a profile
configuration PR re-simulates the profile, reads the configured infra repo's default-branch config,
replaces only the matching repository binding, preserves `todoDispatch` and other bindings, and
requires one exact primary `Closes PREFIX-N` reference. It never activates a profile directly.

The form displays the configuration PR destination before submission. Reconciliation can target
comma-separated work item identifiers such as `VM3K-184, VM3K-187`; omitting them reconciles the
repository scope (a supplied PR hint can resolve its closing item). Pending controls remain disabled
while the bridge checks live providers. Large profiles may take a few minutes because Plane reads
are rate limited and background work shares the serialized evaluator.

Profiles may specify comma-separated required staging assertions. Leave the field empty to keep
the five VM3K defaults, or provide the actual check names produced by another repository's trusted
acceptance workflow. The bridge validates those assertions; Orchid does not manufacture evidence.

Local browser acceptance on 2026-09-04 completed GitHub OAuth as `apps3000`, live VM3K simulation,
targeted observe reconciliation, playbook export, and a real configuration proposal authored by
`app/orchid-dev-dashboard`: [isolated test PR #2](https://github.com/apps3k-com/bridge-e2e-validation/pull/2).
That unmerged proposal copies the existing VM3K observe profile into the test configuration repo;
it does not activate a writer or prove the new test application's deployment lifecycle.
