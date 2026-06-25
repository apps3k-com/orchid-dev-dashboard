# Feature Flags (GrowthBook) — template

Use [GrowthBook](https://gb.apps3k.com) so code can ship to `main` without a
feature being visible to production users (*shipping ≠ activating*). release-please
owns versioning/releases; GrowthBook only governs feature activation and rollout.

## SDK connection & ENV

Create one SDK connection per environment in GrowthBook
(`<repo>-development|staging|production`); keys live in 1Password and are set as
platform env vars. Never hardcode keys.

```
GROWTHBOOK_API_HOST=https://gb-api.apps3k.com
GROWTHBOOK_CLIENT_KEY=<sdk key for this environment>
GROWTHBOOK_ENABLED=true
```

Client-exposed builds (browser/SSG) need the framework's public prefix
(`PUBLIC_GROWTHBOOK_*` for Astro/Vite, `NEXT_PUBLIC_GROWTHBOOK_*` for Next.js).

## Server vs client

- **Server** (APIs, Directus API extensions, Shopify-app backends, workers): use
  `templates/feature-flags/featureFlags.server.ts` — local evaluation, targeting
  rules stay private, evaluate per request with that request's attributes.
- **Client** (browser, SSG, Electron renderer, storefront): use
  `templates/feature-flags/featureFlags.client.ts` — only harmless UI flags (the
  key is public). Sensitive targeting must go through the GrowthBook **proxy**
  (remote evaluation).

The rest of the code imports only the central abstraction, never the SDK directly.
All accessors fail safe to their default when GrowthBook is unavailable.

## Naming, attributes, rollout, lifecycle

- **Naming:** business-meaningful, stable (`new-dashboard`, `checkout-v2`). Avoid
  `flag1`, `temp`, ticket numbers as keys. Keep keys in a `FLAGS` map.
- **Attributes (no PII):** id, userId, accountId, tenantId, role, plan, country,
  locale, platform, isInternal. Never full address, phone, unmasked email, payment
  data, tokens or session secrets.
- **Rollout:** development on → staging on → production off, then production
  gradually: internal → beta → 5/25/50/100 %.
- **Lifecycle:** after full rollout, remove the flag and the legacy path
  (`chore(flags): remove <flag>` / `refactor: drop legacy path`).

## Testing

Test every path: flag on → new behaviour, flag off → old behaviour, GrowthBook
unavailable → safe defaults, missing key/attributes → no crash. Use the SDK's
`initSync({ payload: { features } })` for offline tests (no network). A PR must not
test only the flag-on path.
