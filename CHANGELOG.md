# Changelog

## [1.2.0](https://github.com/apps3k-com/orchid-dev-dashboard/compare/v1.1.1...v1.2.0) (2026-07-08)


### Added

* **ai-providers:** separate model settings from keys + multiple keys per provider ([37dd2fb](https://github.com/apps3k-com/orchid-dev-dashboard/commit/37dd2fb39dd6c4191a07fc10071e3759e3dba2bc))
* **ai-providers:** split model settings from keys + multiple keys per provider ([8cc9e0f](https://github.com/apps3k-com/orchid-dev-dashboard/commit/8cc9e0f17d7f45411a00faa959fa6108d2f1318d))
* **audits:** no default selection, surface failure detail, live progress bar ([f30255e](https://github.com/apps3k-com/orchid-dev-dashboard/commit/f30255ebc28914dac77dce247212a926b8d5e345))
* **audits:** no default selection, surface failure detail, live progress bar ([1427a81](https://github.com/apps3k-com/orchid-dev-dashboard/commit/1427a81894abacf32b6264c613b860f83a50ad7b))
* **hooks:** user-visible diff + confirmable drift ([bead7ff](https://github.com/apps3k-com/orchid-dev-dashboard/commit/bead7ff99bfb481d8969f3ac735d8e27acf9c3cf))
* **hooks:** user-visible diff + confirmable drift ([ca562bf](https://github.com/apps3k-com/orchid-dev-dashboard/commit/ca562bfb11a38e27fe911e94f42fe0e8fcc5f158))
* **modules:** DataTable with description/status + assigned-issue counts ([6d91b9e](https://github.com/apps3k-com/orchid-dev-dashboard/commit/6d91b9e7aaf05e4ea922156593a21fa1e4e48f83))
* **modules:** DataTable with description/status + assigned-issue counts ([b35886c](https://github.com/apps3k-com/orchid-dev-dashboard/commit/b35886c0ad1ed77527dca9128fd8163f9d28d863))
* **pulls:** PR-detail modal with live timeline ([eb23aec](https://github.com/apps3k-com/orchid-dev-dashboard/commit/eb23aec507436ff26540794dae0a011860f798b1))
* **pulls:** PR-detail modal with live timeline ([e71c501](https://github.com/apps3k-com/orchid-dev-dashboard/commit/e71c5019264de699cada80c04df86fc898f1863e))


### Fixed

* apply CodeRabbit auto-fixes ([4e38643](https://github.com/apps3k-com/orchid-dev-dashboard/commit/4e38643ee796587b34940c5304ca93c81eba2dea))
* **github:** distinguish absent modules.yaml from read failures ([4f4f183](https://github.com/apps3k-com/orchid-dev-dashboard/commit/4f4f183b6254e520288434fd0857e15ecd0b72b4))
* **github:** read modules.yaml via GraphQL to silence a spurious 404 ([ba37f81](https://github.com/apps3k-com/orchid-dev-dashboard/commit/ba37f8193d5b1fce4367ebfe7707cdde8d28b959))
* **github:** read modules.yaml via GraphQL to silence a spurious 404 ([0a0aa66](https://github.com/apps3k-com/orchid-dev-dashboard/commit/0a0aa663760a4641b5e4b729c63699f2982928c5))
* **modules:** gate mutations on org membership + preserve form inputs on failed submit ([b494ffa](https://github.com/apps3k-com/orchid-dev-dashboard/commit/b494ffa2576da96baed5f9b5d19ba8280ff9ba67))
* **pulls:** address CodeRabbit review on [#92](https://github.com/apps3k-com/orchid-dev-dashboard/issues/92) ([edce250](https://github.com/apps3k-com/orchid-dev-dashboard/commit/edce250065d2a93729a01511aeea1df9295f53b9))

## [1.1.1](https://github.com/apps3k-com/orchid-dev-dashboard/compare/v1.1.0...v1.1.1) (2026-07-03)


### Fixed

* **dev:** pin Turbopack workspace root to the repo ([da01c7e](https://github.com/apps3k-com/orchid-dev-dashboard/commit/da01c7eebcc2a6094274622ed7d020da762da0cd))
* **github:** resilient PR sync + request Checks/Commit-statuses App permission ([2f8c146](https://github.com/apps3k-com/orchid-dev-dashboard/commit/2f8c1465daefbfe9125294be945d3d78e1bf4df3))

## [1.1.0](https://github.com/apps3k-com/orchid-dev-dashboard/compare/v1.0.0...v1.1.0) (2026-07-03)


### Added

* **audits:** /audits overview page + sidebar + UI-import guard ([2b95a9e](https://github.com/apps3k-com/orchid-dev-dashboard/commit/2b95a9e506631371ecff5c15a63474fac2a46f0a))
* **audits:** add AuditBatch + AuditBatchItem models ([c54033a](https://github.com/apps3k-com/orchid-dev-dashboard/commit/c54033a50705079b114e07108487c70341272019))
* **audits:** audit:estimate worker + enqueue + head-sha helper ([63c08f3](https://github.com/apps3k-com/orchid-dev-dashboard/commit/63c08f333930959d4843567c1c8489fe4d4de5b2))
* **audits:** batch estimate/confirm panel ([6f59e8b](https://github.com/apps3k-com/orchid-dev-dashboard/commit/6f59e8bc76424265cf38f388cb7dc18a87bf7355))
* **audits:** batch server actions (start/confirm/cancel/state) ([dce138d](https://github.com/apps3k-com/orchid-dev-dashboard/commit/dce138d3c831877ead8d56717e8ef6fb6f9edfe7))
* **audits:** Fleet-Audit — /audits overview + batch estimate/confirm/run ([94b7aef](https://github.com/apps3k-com/orchid-dev-dashboard/commit/94b7aef67d5993d74cd9fb2ebd64d5964592874c))
* **audits:** pure batch decision + aggregation logic ([056fad1](https://github.com/apps3k-com/orchid-dev-dashboard/commit/056fad1d398ea01abb668064372ef3ef81568203))
* **audits:** row selection + Audit selected action ([194afcb](https://github.com/apps3k-com/orchid-dev-dashboard/commit/194afcba112f739b9414b0edd0047751a34301e9))
* **audits:** shared badge helper + install fleet UI blocks ([a49df4a](https://github.com/apps3k-com/orchid-dev-dashboard/commit/a49df4a773a30456ee8264f9e2f3373275323662))
* **compliance:** Tier-0 adoption compliance tracker ([8107f71](https://github.com/apps3k-com/orchid-dev-dashboard/commit/8107f715c8b05c440cd907dcc1140e7a10a5563d))
* **compliance:** Tier-0 adoption compliance tracker ([b0edf83](https://github.com/apps3k-com/orchid-dev-dashboard/commit/b0edf83d7ec227f1038f2fa2b29f39b2c53be518))


### Fixed

* **audits:** complete a running batch with no active audits (Task 4 review) ([d63a911](https://github.com/apps3k-com/orchid-dev-dashboard/commit/d63a9113f1088c2d5622a11f3dd69cb4d1979ac5))
* **audits:** consent gate + open-findings filter + guard negative test (final review) ([04fc66f](https://github.com/apps3k-com/orchid-dev-dashboard/commit/04fc66f0b769a5a141d59d08a26bb18fc9aa6743))
* **audits:** estimate applies per-run cap + default-all selection (review) ([ce13f6d](https://github.com/apps3k-com/orchid-dev-dashboard/commit/ce13f6d5e63ef26cf7666f5c2e31c83662e2463d))
* **audits:** non-numeric migration name so it sorts after 9_repo_audit on fresh DBs ([b5f8540](https://github.com/apps3k-com/orchid-dev-dashboard/commit/b5f8540139c796694427c37765279710bfec5a98))
* **audits:** re-poll batch state after confirm (Task 8 review) ([919f52a](https://github.com/apps3k-com/orchid-dev-dashboard/commit/919f52aa4dff46aab2ca0fef01ce289c3d5f5f62))
* **audits:** sequential migration name (10_) so it applies after 9_repo_audit on fresh DBs ([281c0b5](https://github.com/apps3k-com/orchid-dev-dashboard/commit/281c0b53d320931a1de864fffcce2af87fc54504))
* **compliance:** require the full Tier-0 set before reporting tier 0 ([ebd60d1](https://github.com/apps3k-com/orchid-dev-dashboard/commit/ebd60d1cfc332d60215fd36219b2eb2511180eed))
* **deps:** force postcss &gt;=8.5.10 via pnpm override (XSS advisory) ([cb73f19](https://github.com/apps3k-com/orchid-dev-dashboard/commit/cb73f193f68b8bcdeef078ec213a77ad3592bec5))
* **docker:** drop pnpm-incompatible Prisma COPY that broke the bundle build ([261dec1](https://github.com/apps3k-com/orchid-dev-dashboard/commit/261dec1caf27e0851889aa2d53d726373f9eb75e))
* **setup:** grant org Actions variables in the App manifest (PRODUCTS write) ([600425d](https://github.com/apps3k-com/orchid-dev-dashboard/commit/600425d8a2887f66b96c058e77c11704f2600e0f))


### Changed

* **audits:** keep collectAuditContext single repoClient call (Task 3 review) ([1c5dacf](https://github.com/apps3k-com/orchid-dev-dashboard/commit/1c5dacf0b764a302d77433ad20ae2179b4ec9f5c))

## 1.0.0 (2026-06-30)


### Added

* **auth:** GitHub App onboarding, OAuth login, and /setup ([c308b72](https://github.com/apps3k-com/orchid-dev-dashboard/commit/c308b72bcfe9fc58683e3762961562ee895d23fc))
* **auth:** GitHub App onboarding, OAuth login, and /setup ([17989fe](https://github.com/apps3k-com/orchid-dev-dashboard/commit/17989fee21ea06095f3d1f1198a208c4c079eb1e))
* **automations:** activate recipes via org-level credentials (6b) ([5e519b0](https://github.com/apps3k-com/orchid-dev-dashboard/commit/5e519b008b1e1f9b63c5eecee4e3658b9cf97ab6))
* **automations:** activate recipes via org-level credentials (6b) ([eb7b624](https://github.com/apps3k-com/orchid-dev-dashboard/commit/eb7b624bf3da77ec1264efeb71f65ce4350c503d))
* **automations:** install tracking + reconcile (6b-2) ([1373e7d](https://github.com/apps3k-com/orchid-dev-dashboard/commit/1373e7d9063fe7a57a5635db4b6a3b81535d7b66))
* **automations:** install tracking + reconcile (6b-2) ([1e7f323](https://github.com/apps3k-com/orchid-dev-dashboard/commit/1e7f3239a4f4b2fc76191f20eac55993eaf6e024))
* **automations:** recipe catalog + provision via PR (6a) ([3d705c6](https://github.com/apps3k-com/orchid-dev-dashboard/commit/3d705c6a6646c875c7fb9f6ff86bd99bfd958b67))
* **automations:** recipe catalog + provision via PR (6a) ([db4af25](https://github.com/apps3k-com/orchid-dev-dashboard/commit/db4af25acb5219392857eab8689847a043099f4a))
* **byok:** apply an audit finding as a fix PR ([11304a2](https://github.com/apps3k-com/orchid-dev-dashboard/commit/11304a2fdd25898e5102eb53b8263e89df121e68))
* **byok:** apply an audit finding as a fix PR ([d741895](https://github.com/apps3k-com/orchid-dev-dashboard/commit/d7418957f73c15f72bfc9eeaa8e8e2f25525ac31)), closes [#52](https://github.com/apps3k-com/orchid-dev-dashboard/issues/52)
* **byok:** encryption key rotation (re-encrypt at-rest secrets) ([9164939](https://github.com/apps3k-com/orchid-dev-dashboard/commit/9164939833b2f789af763e15a40fe33beeab5c36))
* **byok:** encryption key rotation (re-encrypt at-rest secrets) ([2a3eb2a](https://github.com/apps3k-com/orchid-dev-dashboard/commit/2a3eb2a5b304e94c2f63e7bb17925f1e58b6883e)), closes [#55](https://github.com/apps3k-com/orchid-dev-dashboard/issues/55)
* **byok:** LLM audit run for a repo's agent/hook config ([4be6b9e](https://github.com/apps3k-com/orchid-dev-dashboard/commit/4be6b9e284be3ba5feeace562f0eb07247bdeebd))
* **byok:** LLM audit run for a repo's agent/hook config ([dbfa9dd](https://github.com/apps3k-com/orchid-dev-dashboard/commit/dbfa9dd60a22b6db4a5283e25cc0d063fdbbdb1a)), closes [#50](https://github.com/apps3k-com/orchid-dev-dashboard/issues/50)
* **byok:** provider key foundation for the agent/hook auditor ([93da13b](https://github.com/apps3k-com/orchid-dev-dashboard/commit/93da13b8669bc9af0e637a4f75f6cdb270414935))
* **byok:** provider key foundation for the agent/hook auditor ([e8edad2](https://github.com/apps3k-com/orchid-dev-dashboard/commit/e8edad2e9cc9a9312f2cb4fbfad7482ab388b7a6)), closes [#48](https://github.com/apps3k-com/orchid-dev-dashboard/issues/48)
* **cockpit:** authed shell + cross-repo PR board + repo inventory ([0356cdf](https://github.com/apps3k-com/orchid-dev-dashboard/commit/0356cdf262a986c10f32affca77b7d46c84ed93d))
* **cockpit:** authed shell + cross-repo PR board + repo inventory ([e32c8f9](https://github.com/apps3k-com/orchid-dev-dashboard/commit/e32c8f9ab8357cd2ddeaa4223b204a4e125890e8))
* **cockpit:** data tables for PRs/repos + dashboard stat cards ([483e060](https://github.com/apps3k-com/orchid-dev-dashboard/commit/483e06043756077533d93830670bd814451c8717))
* **cockpit:** data tables for PRs/repos + dashboard stat cards ([26ca658](https://github.com/apps3k-com/orchid-dev-dashboard/commit/26ca658014bbdc5a84674f47a6f4183a6d9155ed))
* **hooks:** one-click re-sync PR for drifted agent hooks ([00f78aa](https://github.com/apps3k-com/orchid-dev-dashboard/commit/00f78aa8f2ed2cb86b7b85f2ca0477f719f3eae8))
* **hooks:** one-click re-sync PR for drifted agent hooks ([141c730](https://github.com/apps3k-com/orchid-dev-dashboard/commit/141c730eb6d0328576a311d64324f6042ee229d5)), closes [#43](https://github.com/apps3k-com/orchid-dev-dashboard/issues/43)
* **hooks:** per-repo agent-hook drift overview vs canonical template ([58702b7](https://github.com/apps3k-com/orchid-dev-dashboard/commit/58702b7a4e46562431e41ce8f7f3642389f8b0c4))
* **hooks:** per-repo agent-hook drift overview vs canonical template ([2b7edac](https://github.com/apps3k-com/orchid-dev-dashboard/commit/2b7edacc2a9c89a946f0b938af8495efb96a3f1b)), closes [#34](https://github.com/apps3k-com/orchid-dev-dashboard/issues/34)
* **modules:** per-repo module editor with write-back via PR ([6f63903](https://github.com/apps3k-com/orchid-dev-dashboard/commit/6f63903ba63fdcf9f84d02ce0c583031fc527799))
* **modules:** per-repo module editor with write-back via PR ([3dedf72](https://github.com/apps3k-com/orchid-dev-dashboard/commit/3dedf720054cea01527bc36b05f7c5d748f5526c))
* **products:** per-org editor for the PRODUCTS taxonomy variable ([4de51e9](https://github.com/apps3k-com/orchid-dev-dashboard/commit/4de51e9a9915230b48caac868b89a6adc0f88a79))
* **products:** per-org editor for the PRODUCTS taxonomy variable ([364d12a](https://github.com/apps3k-com/orchid-dev-dashboard/commit/364d12a6f178b9db2aaade74c3b94b8518d5a93f))
* **projects:** cross-org GitHub Projects overview ([e8660b3](https://github.com/apps3k-com/orchid-dev-dashboard/commit/e8660b344d6d0de96836f72cc95971cb040eacbe))
* **projects:** cross-org GitHub Projects overview ([bfbe160](https://github.com/apps3k-com/orchid-dev-dashboard/commit/bfbe1603ed8863ba32ae404311be21918a51de4c))
* **projects:** per-project board with items grouped by Status ([43209ef](https://github.com/apps3k-com/orchid-dev-dashboard/commit/43209ef5e0b4cba572064c25eab38f9f1fca22a4))
* **projects:** per-project board with items grouped by Status ([adec9f5](https://github.com/apps3k-com/orchid-dev-dashboard/commit/adec9f508417c25926ffab87fd95053c5fc64352)), closes [#37](https://github.com/apps3k-com/orchid-dev-dashboard/issues/37)
* **projects:** richer board items + repo/assignee filters ([7ee4c79](https://github.com/apps3k-com/orchid-dev-dashboard/commit/7ee4c796c3e266fbbaf9398385751d4bc3fc010e))
* **projects:** richer board items + repo/assignee filters ([324e6c9](https://github.com/apps3k-com/orchid-dev-dashboard/commit/324e6c90a76e021be3b1d916970df71b3b0935f8)), closes [#45](https://github.com/apps3k-com/orchid-dev-dashboard/issues/45)
* scaffold the Orchid dashboard app (Next 16 + Prisma + Docker bundle) ([3799645](https://github.com/apps3k-com/orchid-dev-dashboard/commit/37996456f460a829169cf189698225108c4097c8))
* scaffold the Orchid dashboard app (Next 16 + Prisma + Docker bundle) ([70f9af5](https://github.com/apps3k-com/orchid-dev-dashboard/commit/70f9af5a9a309d660a8041fda2d5bc05f90a2c41))
* **sync:** GitHub data layer + in-process worker (installations, repos, PRs) ([750a57a](https://github.com/apps3k-com/orchid-dev-dashboard/commit/750a57a4d5675f1f4eac7849f3b7aa59eb809643))
* **sync:** GitHub data layer + in-process worker (installations, repos, PRs) ([19a48a7](https://github.com/apps3k-com/orchid-dev-dashboard/commit/19a48a7f41268518f0926bf29cd8e105a5446b8f))
* **ui:** adopt shadcnstudio registry + sidebar app-shell ([4c5017c](https://github.com/apps3k-com/orchid-dev-dashboard/commit/4c5017c3b8ed8943de9087ae3b06fb00a0d48221))
* **ui:** shadcnstudio registry + sidebar app-shell ([a129395](https://github.com/apps3k-com/orchid-dev-dashboard/commit/a129395818a6bfb5182c65b62241f6b8dbbc9d46))


### Fixed

* address CodeRabbit on scaffold (build gate, healthcheck, immutable ids, docs) ([8dfd488](https://github.com/apps3k-com/orchid-dev-dashboard/commit/8dfd4881acf53abb0bade0137544a31c1f44742e))
* **auth:** only 404 = non-member; clear state cookie on all terminal redirects ([07c46e2](https://github.com/apps3k-com/orchid-dev-dashboard/commit/07c46e28e857a2f6b9f64936c2465e7a481f4125))
* **auth:** unescape PEM newlines before the multiline short-circuit (CodeRabbit) ([5c141f7](https://github.com/apps3k-com/orchid-dev-dashboard/commit/5c141f7469cccd3ae43f54b6ca6914095395e587))
* **automations:** full self-disable guard + strict repo-name parsing ([6830fea](https://github.com/apps3k-com/orchid-dev-dashboard/commit/6830fea6d10b759bd68d31b75dc4212249a486cb))
* **automations:** harden activation per sub-agent review ([a94acad](https://github.com/apps3k-com/orchid-dev-dashboard/commit/a94acadd06acb87abc7b7f17a3b966d7253a2186))
* **automations:** scope org secret to selected repos + harden upserts (CR) ([8560e1c](https://github.com/apps3k-com/orchid-dev-dashboard/commit/8560e1c0ccfd80acd0e4266a327fbb8721512a02))
* **automations:** version-aware reconcile, split tracking, always-show installs ([aceea47](https://github.com/apps3k-com/orchid-dev-dashboard/commit/aceea47a8e7a1cec78a89bdb081f87dede0ab518))
* **byok:** address CodeRabbit review on provider keys ([3ec08a1](https://github.com/apps3k-com/orchid-dev-dashboard/commit/3ec08a166f49e5211c42c73a55511e600f088f45))
* **byok:** clamp retired model + remaining docstrings (CodeRabbit) ([b9e0416](https://github.com/apps3k-com/orchid-dev-dashboard/commit/b9e0416a387b36564131d1b234bb999fb484cdf7))
* **byok:** constrain 'missing' findings to the audit surface (CodeRabbit) ([bdc18fd](https://github.com/apps3k-com/orchid-dev-dashboard/commit/bdc18fd7e63eeb19b708a533fc04428202a6a34e))
* **byok:** harden audit run per CodeRabbit ([2c89700](https://github.com/apps3k-com/orchid-dev-dashboard/commit/2c897002f449d1032defea141cc8991d3c1432fe))
* **byok:** keep missing-file findings + harden audit edges (CodeRabbit round 2) ([a3c849f](https://github.com/apps3k-com/orchid-dev-dashboard/commit/a3c849ffba18aefac748d4c1ce9f509a26b41b5a))
* **byok:** make the audit fix-PR idempotency guard atomic (CodeRabbit) ([7fc8558](https://github.com/apps3k-com/orchid-dev-dashboard/commit/7fc855822f9d8fc96793ebb3f236540a06628a34))
* **byok:** make the audit structured-output request API-valid ([d3d0067](https://github.com/apps3k-com/orchid-dev-dashboard/commit/d3d0067c78e3e31e9ed403aab485e5092e2e0b8e))
* **byok:** make the audit structured-output request API-valid ([e2b23ff](https://github.com/apps3k-com/orchid-dev-dashboard/commit/e2b23ff31fef97e874f8f740f3f632ff8540f218))
* **byok:** null-check proposedPatch + re-verify file exists before fix PR (CodeRabbit) ([03535ec](https://github.com/apps3k-com/orchid-dev-dashboard/commit/03535ec11835f3e75f39aabe37d8f72725052b23))
* **byok:** nullish webhook check + strict blob segment validation (CodeRabbit) ([cfa648c](https://github.com/apps3k-com/orchid-dev-dashboard/commit/cfa648c87de98b18f800961951f1600cac0b8bc8))
* **byok:** snapshot-bound mustExist + no release on post-write failures (CodeRabbit) ([efd46f4](https://github.com/apps3k-com/orchid-dev-dashboard/commit/efd46f42a812e59501528939d38d85b61f55b4f8))
* **cockpit:** a11y polish for new-tab links + trend icons ([0e85268](https://github.com/apps3k-com/orchid-dev-dashboard/commit/0e852685f7b70ae771b9e7d3fbfe8bf497f44e59))
* **cockpit:** address CodeRabbit review on [#15](https://github.com/apps3k-com/orchid-dev-dashboard/issues/15) ([a92cbec](https://github.com/apps3k-com/orchid-dev-dashboard/commit/a92cbec4beb014ff1f312229ee35ecbc6519a8e1))
* **cockpit:** shadcn Button for sign-out; count only open PRs ([868d287](https://github.com/apps3k-com/orchid-dev-dashboard/commit/868d287e0d438156983815758ff434f05f2f8734))
* **hooks:** address CodeRabbit review on re-sync ([6971e64](https://github.com/apps3k-com/orchid-dev-dashboard/commit/6971e64de2aa5589ae1f6373884a224be77abbd8))
* **hooks:** make syncHooks template resolution best-effort and leak-safe ([ea24835](https://github.com/apps3k-com/orchid-dev-dashboard/commit/ea2483529395172366ef4fea421332d1e1aebb1e))
* **hooks:** make syncHooks template resolution best-effort and leak-safe ([b491267](https://github.com/apps3k-com/orchid-dev-dashboard/commit/b4912673ab3252b03307928cde254a0b50e9fed1)), closes [#39](https://github.com/apps3k-com/orchid-dev-dashboard/issues/39)
* **modules:** order-sensitive no-op guard, atomic head read, unique branch ([9a2332e](https://github.com/apps3k-com/orchid-dev-dashboard/commit/9a2332e35f66f1bbddef87d5f557cb5c04633893))
* **products:** generic save error + live-region status ([220363a](https://github.com/apps3k-com/orchid-dev-dashboard/commit/220363a45a6e173367d9b71b584b8169e8e6f718))
* **projects:** address CodeRabbit review on board fields ([5c9f7ce](https://github.com/apps3k-com/orchid-dev-dashboard/commit/5c9f7cef918957d28f4ecfef6c5f67f92634c8d4))
* **projects:** address CodeRabbit review on the board ([769daec](https://github.com/apps3k-com/orchid-dev-dashboard/commit/769daec297cec7d40bd87d3573c04293068c9a72))
* **projects:** address self-review on the board increment ([ec8ee4c](https://github.com/apps3k-com/orchid-dev-dashboard/commit/ec8ee4c4a6c9f7e5f5de0a5fe621c0fdad798716))
* **projects:** don't purge the cache on a null org response ([6c3c968](https://github.com/apps3k-com/orchid-dev-dashboard/commit/6c3c968946a548c96c74216f76cd6484968fa8d0))
* **refresh:** enqueue sync:all on the worker instead of blocking the request ([aba8613](https://github.com/apps3k-com/orchid-dev-dashboard/commit/aba8613f4b8c5e73650f1c99fa5e479f6d0e48a3))
* **refresh:** enqueue sync:all on the worker instead of blocking the request ([54fd8a2](https://github.com/apps3k-com/orchid-dev-dashboard/commit/54fd8a2447c255f981347e7d05fb52a8666dda91)), closes [#36](https://github.com/apps3k-com/orchid-dev-dashboard/issues/36)
* robust GitHub App key handling, OAuth callback, BYOK key validation ([b87fe52](https://github.com/apps3k-com/orchid-dev-dashboard/commit/b87fe52b35d789cbacb833cea766d5f3c9497d5d))
* robust GitHub App key handling, OAuth callback, BYOK key validation ([645872e](https://github.com/apps3k-com/orchid-dev-dashboard/commit/645872e2dffe1c823a7e34f2dcb770a9312bb77d))
* **ui:** address CodeRabbit review on [#13](https://github.com/apps3k-com/orchid-dev-dashboard/issues/13) ([8e87dcf](https://github.com/apps3k-com/orchid-dev-dashboard/commit/8e87dcf3a12d9f26674ba05193f64dee007da1ea))
