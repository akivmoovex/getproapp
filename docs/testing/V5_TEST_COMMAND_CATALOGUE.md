# BlessBoard V5 — Test command catalogue

**Date:** 2026-07-19  
**Purpose:** Reliable operator catalogue of BlessBoard V5 automated tests and safe rehearsal commands.  
**Constraint:** Documentation + optional grouping scripts only. No application behavior changes.

### Legend (every command row)

| Field | Meaning |
|-------|---------|
| **DB** | Needs local PostgreSQL (typically ephemeral `blessboard_foundation_test` via `tests/helpers/foundationDb.js`, or migration fixture DBs) |
| **Hosted** | Needs live apex/tenant hosts or production/staging data |
| **Writes** | Mutates data (local ephemeral DB only unless noted) |
| **Success** | Typical pass signal for `node --test` |

**Safe default assumption:** `NODE_ENV=test`, local Postgres peer/auth on `localhost:5432`, **never** point foundation helpers at hosted production URLs.

**Out of scope for this catalogue as automated “green” gates:** Playwright visual suites, hosted GUI smoke plans, and `migrate:v4-to-v5:apply` against non-fixture databases.

---

## 1. Fast pre-commit tests

Filesystem / render-unit checks. No Postgres required.

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:precommit-fast` | One-shot static V5 gate | Design system, a11y, responsive, assets, server-query audit, route/CSRF/input audits, apex auth GUI, tenant routing mode | No | No | No | Repo checkout only | `# fail 0` | None known |
| `npm run test:blessboard:design-system` | Tokens + DS partials | `tests/blessboard-design-system.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:apex-auth-gui` | Login/error presentation | `tests/blessboard-apex-auth-gui.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:a11y-structure` | Landmark/heading/skip structure | `tests/blessboard-v5-a11y-structure.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:responsive-structure` | Narrow-layout CSS contracts | `tests/blessboard-v5-responsive-structure.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:frontend-assets` | CSS/JS include + cache-bust contracts | `tests/blessboard-v5-frontend-assets.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:server-query-audit` | Dashboard query / EJS cache contracts | `tests/blessboard-v5-server-query-audit.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:route-link-audit` | Route/link integrity (static) | `tests/blessboard-v5-route-link-audit.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:csrf-action-audit` | CSRF action coverage (static) | `tests/blessboard-v5-csrf-action-audit.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:input-output-safety` | XSS/escape contracts (static) | `tests/blessboard-v5-input-output-safety.test.js` | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:tenant-routing-mode` *(via mode file in precommit)* | Routing mode enum/guards | Included in `precommit-fast` via `tests/blessboard-tenant-routing-mode.test.js` | No | No | No | — | `# fail 0` | — |

Also useful before commit (not V5-only): `npm run check:ejs-partials` — EJS include graph; no DB.

**Not recommended as a pre-commit gate:** `npm run lint:css` with `--max-warnings 0` — fails on pre-existing `color-no-hex` warnings across `public/**/*.css` (0 errors, many warnings).

---

## 2. Apex tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:apex` | Grouped apex suite | Auth GUI + home + marketing | Mixed | No | Local ephemeral (home/marketing) | Local Postgres for home/marketing | All nested `# fail 0` | — |
| `npm run test:blessboard:apex-auth-gui` | Auth page HTML states | Login/error/account render | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:apex-home` | Apex home HTTP + assets | `tests/blessboard-apex-home.test.js` | Yes | No | Ephemeral foundation DB | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:apex-marketing` | Features/pricing/directory | `tests/blessboard-apex-marketing.test.js` | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |

Manual hosted apex smoke: see `docs/testing/V5_DEMO_E2E_SMOKE_TEST.md` (T01–T05) — **not** an npm script.

---

## 3. Tenant-public tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:public-content-schema` | Public CMS schema/services | Schema + read/write services | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:public-pages` | Tenant public page HTTP | Home/about/etc. render paths | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:content-admin` | Branch/HQ content admin | Page/section/entity admin | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:settings` | Church/branch settings | Settings services + HTTP | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |

Companions (manual): `docs/gui/TENANT_PUBLIC_PARITY_AUDIT.md`, `docs/ui/V5_PUBLIC_GUI_AUDIT.md`.

---

## 4. Authentication / session tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:auth-schema` | Auth schema presence | Migrations + tables | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:auth` | Auth HTTP (apex login flows) | `tests/blessboard-auth-http.test.js` | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:tenant-auth` | Tenant-host login / transfer | Alias of tenant-host-login | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:tenant-host-login` | Same as tenant-auth | Identical script target | Yes | No | Ephemeral | — | `# fail 0` | Duplicate script name — same command |
| `npm run test:platform:sessions` | V5 session create/revoke | `tests/platform-v5-sessions.test.js` | Yes | No | Ephemeral | `foundationDb` | `# fail 0` | — |
| `npm run test:blessboard:apex-auth-gui` | Presentation-only auth | See §1 | No | No | No | — | `# fail 0` | — |

Security companion docs: `docs/security/V5_SESSION_COOKIE_AUDIT.md`, `docs/security/V5_CSRF_ACTION_AUDIT.md`.

---

## 5. Member tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:member-suite` | Grouped member modules | Schema + registration + portal + announcements + participation | Yes | No | Ephemeral | Local Postgres | Nested `# fail 0` | — |
| `npm run test:blessboard:members-schema` | Members schema | Tables/constraints | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:member-registration` | Registration review flows | Submit/approve/deny | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:member-portal` | Member shell/profile/dashboard | Portal HTTP | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:announcements` | Member + admin announcements | List/detail/publish | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:participation` | Events/ministries | Join/register flows | Yes | No | Ephemeral | — | `# fail 0` | — |

Companion: `docs/gui/MEMBER_PORTAL_PARITY_AUDIT.md`.

---

## 6. Branch Admin tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:branch-admin-shell` | BA shell/nav/dashboard | Shell HTTP + templates | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:branch-list` | Branch listing helpers | HQ/BA branch lists | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:content-admin` | Website CMS admin | Shared BA/HQ content | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:attendance` | Attendance admin | Events/entries | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:giving` | Giving admin | Summaries/entries | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:forms-requests` | Forms/resources/requests | Admin + member forms | Yes | No | Ephemeral | — | `# fail 0` | — |

Companion: `docs/gui/BRANCH_ADMIN_PARITY_AUDIT.md`.

---

## 7. HQ tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:hq-shell` | HQ shell + branches UI | Shell HTTP | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:reports-audit` | HQ reports + audit log | Aggregates + audit viewer | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:branch-list` | Branch registry data | Shared with BA | Yes | No | Ephemeral | — | `# fail 0` | — |

Many module suites (§5–6) also exercise HQ `shellKind` paths.

Companion: `docs/gui/HQ_ADMIN_PARITY_AUDIT.md`.

---

## 8. Platform Admin tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:platform-admin-shell` | PA shell + directories | Orgs/plans/domains/deploys | Yes | No | Ephemeral | Apex host context in tests | `# fail 0` | — |
| `npm run test:platform:entitlements` | Entitlement catalogue/services | Platform entitlements | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:platform:provisioning` | Tenant provisioning | Platform tenant create | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:provisioning` | Church provision CLI/service | Church + catalogue | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:catalogue` | Catalogue schema + lookup | Schema + lookup | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:http-context` | Catalogue HTTP context | Middleware/context | Yes | No | Ephemeral | — | `# fail 0` | — |

Companion: `docs/gui/PLATFORM_ADMIN_PARITY_AUDIT.md`.

---

## 9. Media tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:media` | Upload/list/archive/picker | Media assets + picker JS contracts | Yes | No | Ephemeral (+ local files under test upload path) | `foundationDb` | `# fail 0` | — |

Companion: `docs/security/V5_MEDIA_ATTACHMENT_SECURITY_AUDIT.md`.

---

## 10. Authorization / security tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:security-audits` | Grouped static security audits | CSRF + input/output + route/link | No | No | No | — | Nested `# fail 0` | — |
| `npm run test:blessboard:authorization` | Role/scope authz matrix | Tenant role gates | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:blessboard:csrf-action-audit` | CSRF on mutating actions | Static + pattern checks | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:input-output-safety` | Escape/URL safety | Static + unit | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:route-link-audit` | Dead/wrong links | Static | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:server-query-audit` | Avoid discarded N+1 | Static contracts | No | No | No | — | `# fail 0` | — |

Companions: `docs/security/V5_*_AUDIT.md`, `docs/security/V5_DATABASE_QUERY_BOUNDARY_AUDIT.md`.

---

## 11. Routing / deployment-identity tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:tenant-routing` | Shadow/authoritative routing | Mode + evaluateTenantRoute + HTTP | Yes | No | Ephemeral | Does **not** enable hosted shadow | `# fail 0` | — |
| `npm run test:blessboard:tenant-routing-mode` | Mode parser only | Config unit tests | No | No | No | — | `# fail 0` | — |
| `npm run test:platform:resolution` | Hostname resolution | Platform host resolve | Yes* | No | Ephemeral* | See test file | `# fail 0` | — |
| `npm run test:platform:http-context` | Host context middleware | Middleware | Mixed | No | Possibly ephemeral | — | `# fail 0` | — |
| `npm run test:platform:host-comparison` | Host comparison helpers | Unit | No* | No | No | Confirm in file if pure | `# fail 0` | — |
| `npm run test:platform:diagnostic-integration` | Diagnostic tenant wiring | Integration | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run test:v5:foundation-startup` | V5 foundation app boot | Startup smoke | Mixed | No | No* | Local | `# fail 0` | — |
| `npm run test:db:foundation` | DB foundation scripts | Identity/migrate helpers | Yes | No | Ephemeral | — | `# fail 0` | — |
| `npm run db:identity:check` | Identity check CLI | Read-only identity | Yes | No† | No | Safe against configured URL — verify URL is local | Exit 0 | †Can hit whatever `DATABASE_URL` points to — **verify local** |

\*Confirm individual platform tests if suite is skipped without DB.

Companions: `docs/deployment/V5_SHADOW_ROUTING_READINESS.md`, `docs/deployment/V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md` (ops docs — not npm tests).

---

## 12. Migration rehearsal tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:migration:mapping` | Row transform mapping | Unit mapping | No | No | No | — | `# fail 0` | — |
| `npm run test:migration:tooling` | Pipeline safety tooling | Local fixture DBs | Yes (fixtures) | No | Fixture DBs only | `migrationFixtureDb` local | `# fail 0` | Skips if fixtures unavailable |
| `npm run migrate:v4-to-v5:plan` | Plan only | CLI plan | Yes | No‡ | No | Distinct source/target URLs | Exit 0 + plan output | ‡Must not use prod as target |
| `npm run migrate:v4-to-v5:dry-run` | Dry-run | CLI dry-run | Yes | No‡ | No (no apply) | Fixture or isolated DBs | Exit 0 | — |
| `npm run migrate:v4-to-v5:rehearsal` | Full local rehearsal | Create fixtures → plan → apply → verify → rollback | Yes (local fixtures) | **No** | Fixture DBs only | Documented in `V4_TO_V5_MIGRATION_REHEARSAL.md` | Exit 0 + PASS report | — |
| `npm run migrate:v4-to-v5:verify` | Verify after apply | Reconciliation | Yes | No‡ | No | After apply | Exit 0 | — |

### Intentionally excluded (dangerous / hosted)

| Command | Why excluded from catalogue “safe run” |
|---------|----------------------------------------|
| `npm run migrate:v4-to-v5:apply` | Writes to target DB; never run against hosted production from this catalogue |
| Hosted cutover steps in `docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md` | Operator runbook, not CI |
| `church:demo-reset` / `church:seed-demos` against hosted | Can alter shared demo data |

---

## 13. CSS and accessibility tests

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:structure` | Grouped structure suite | DS + a11y + responsive + assets + server-query | No | No | No | — | Nested `# fail 0` | — |
| `npm run test:blessboard:a11y-structure` | A11y structure | See §1 | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:responsive-structure` | Responsive CSS | See §1 | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:frontend-assets` | Asset efficiency contracts | See §1 | No | No | No | — | `# fail 0` | — |
| `npm run test:blessboard:design-system` | Design tokens/system | See §1 | No | No | No | — | `# fail 0` | — |
| `npx stylelint "public/blessboard/v5/*.css"` | Stylelint V5 CSS | Warnings allowed unless `--max-warnings 0` | No | No | No | — | 0 errors | `--max-warnings 0` fails on pre-existing hex warnings |
| `npm run lint:css` | Whole `public/**/*.css` | Repo-wide | No | No | No | — | Often fails warnings gate | Pre-existing `color-no-hex` |

Companions: `docs/gui/V5_ACCESSIBILITY_AUDIT.md`, `docs/gui/V5_RESPONSIVE_STATIC_AUDIT.md`, `docs/performance/V5_FRONTEND_ASSET_AUDIT.md`.

---

## 14. Full non-destructive regression

### Canonical commands

| Command | Mode | What it runs |
|---------|------|----------------|
| `npm run test:blessboard:v5:regression:fast` | Fast | Static pre-commit suite only (`test:blessboard:precommit-fast`) |
| `npm run test:blessboard:v5:regression` | Full | Complete local/CI V5 foundation sequence (see below) |
| `npm run test:blessboard:regression-local` | Alias | Same as `v5:regression:fast` (kept for catalogue compatibility) |

Runner: `scripts/run-blessboard-v5-regression.js`  
Behavior: prints a labeled banner per suite, runs `npm run <script>`, **exits immediately** on non-zero status (no `|| true`, exit codes preserved).

### Full suite order (`test:blessboard:v5:regression`)

1. `test:blessboard:precommit-fast` — static structure/security/routing-mode  
2. `test:blessboard:shells` — branch / HQ / platform shells  
3. `test:blessboard:apex` — apex auth GUI + home + marketing  
4. `test:blessboard:auth-schema`  
5. `test:blessboard:auth`  
6. `test:blessboard:tenant-auth`  
7. `test:platform:sessions`  
8. `test:blessboard:authorization`  
9. `test:blessboard:member-suite`  
10. `test:blessboard:admin-modules`  
11. `test:blessboard:media`  
12. `test:blessboard:public-pages`  
13. `test:blessboard:public-content-schema`  
14. `test:blessboard:settings`  
15. `test:blessboard:branch-list`  
16. `test:blessboard:tenant-routing`  
17. `test:blessboard:catalogue`  
18. `test:blessboard:http-context`  
19. `test:blessboard:provisioning`  
20. `test:platform:entitlements`  
21. `test:migration:mapping` — unit mapping only  
22. `test:migration:tooling` — **local fixture DBs only**

Writes (when DB suites run): ephemeral `blessboard_foundation_test` / migration fixture databases on localhost — **not** hosted production.

### Explicitly excluded from the runner

| Excluded | Why |
|----------|-----|
| `migrate:v4-to-v5:apply` | Hosted/target DB writes |
| `migrate:v4-to-v5:rehearsal` | Longer fixture lifecycle; optional separate local command |
| `migrate:v4-to-v5:dry-run` / `plan` / `verify` against arbitrary URLs | Operator CLI; mis-pointing risk |
| `church:seed-demos`, `church:demo-reset`, pilot seed/cleanup | Can alter shared/demo data |
| `npm test` | Entire repo including V4 church suites |
| `test:ui`, `test:e2e:*`, screenshot scripts | Browser / V4-era visual harnesses |
| `test:church:*` | Legacy church product paths |
| Hosted smoke (`V5_DEMO_E2E_SMOKE_TEST.md`) | Manual / requires authoritative routing |
| Env/DNS/deploy scripts (`church:v5:deploy-init`, routing mode flips) | Environment changes |
| `lint:css --max-warnings 0` | Pre-existing warning gate noise; not a V5 functional suite |

### Recommended local sequence (manual equivalent of full)

Same as full runner order above. Optional after green: `npm run migrate:v4-to-v5:rehearsal` (local fixtures only).

| Command | Purpose | Scope | DB | Hosted | Writes | Assumptions | Success | Known issues |
|---------|---------|-------|----|--------|--------|-------------|---------|--------------|
| `npm run test:blessboard:v5:regression:fast` | Fast static gate | precommit-fast | No | No | No | Checkout only | Exit 0 + PASSED banner | — |
| `npm run test:blessboard:v5:regression` | Full V5 foundation | 22 labeled npm suites | Mixed | No | Ephemeral local only | Local Postgres for DB legs | Exit 0 + PASSED banner | Fail-fast stops remaining suites |
| `npm run test:blessboard:shells` | BA + HQ + PA shells | Three shell suites | Yes | No | Ephemeral | — | Nested `# fail 0` | — |
| `npm run test:blessboard:admin-modules` | Attendance/giving/forms/reports/content | Admin modules | Yes | No | Ephemeral | — | Nested `# fail 0` | — |

### Not used as V5 regression green bar

| Command | Reason |
|---------|--------|
| `npm test` | Entire `tests/**/*.test.js` including V4 church suites; broader than V5 |
| `npm run test:ui` / `test:e2e:*` | Playwright / browser; separate harness |
| `npm run test:church:*` | Legacy church product paths |
| Hosted demo E2E | Manual: `docs/testing/V5_DEMO_E2E_SMOKE_TEST.md` |

---

## Package scripts added by this catalogue

| Script | Groups |
|--------|--------|
| `test:blessboard:precommit-fast` | Static V5 audits + apex-auth-gui + routing-mode |
| `test:blessboard:structure` | design-system + a11y + responsive + frontend-assets + server-query |
| `test:blessboard:security-audits` | csrf + input-output + route-link |
| `test:blessboard:apex` | apex-auth-gui + apex-home + apex-marketing |
| `test:blessboard:shells` | branch + hq + platform shells |
| `test:blessboard:member-suite` | members-schema + registration + portal + announcements + participation |
| `test:blessboard:admin-modules` | attendance + giving + forms-requests + reports-audit + content-admin |
| `test:blessboard:v5:regression:fast` | Labeled fail-fast runner → precommit-fast |
| `test:blessboard:v5:regression` | Labeled fail-fast runner → full local V5 foundation |
| `test:blessboard:regression-local` | Alias of `v5:regression:fast` |

Existing per-module scripts were left intact (including duplicate `tenant-auth` / `tenant-host-login`).

---

## Quick reference — existing per-module scripts

All of:  
`test:blessboard:catalogue`, `http-context`, `provisioning`, `auth-schema`, `auth`, `apex-auth-gui`, `tenant-routing`, `authorization`, `branch-admin-shell`, `hq-shell`, `branch-list`, `platform-admin-shell`, `tenant-auth`, `settings`, `public-content-schema`, `apex-home`, `apex-marketing`, `design-system`, `a11y-structure`, `responsive-structure`, `frontend-assets`, `server-query-audit`, `public-pages`, `content-admin`, `media`, `members-schema`, `member-registration`, `member-portal`, `announcements`, `participation`, `attendance`, `giving`, `forms-requests`, `reports-audit`, `route-link-audit`, `csrf-action-audit`, `input-output-safety`, `test:platform:sessions`.

---

## Exact results for newly added scripts (2026-07-19)

| Script | Result |
|--------|--------|
| `test:blessboard:precommit-fast` | **170 pass / 0 fail** |
| `test:blessboard:structure` | **121 pass / 0 fail** |
| `test:blessboard:security-audits` | **23 pass / 0 fail** |
| `test:blessboard:shells` | BA 12 + HQ 9 + PA 12 — all **0 fail** |
| `test:blessboard:apex` | auth-gui 4 + home 3 + marketing 7 — all **0 fail** |
| `test:blessboard:regression-local` | Alias of `v5:regression:fast` |
| `test:blessboard:v5:regression:fast` | Exit **0** — PASSED in **0.5s** (precommit-fast, 170 pass / 0 fail) |
| `test:blessboard:v5:regression` | Exit **0** — PASSED in **88.7s** (all 22 labeled suites) |
| `test:blessboard:member-suite` | 8 + 17 + 16 + 18 + 11 — all **0 fail** |
| `test:blessboard:admin-modules` | attendance 8 + giving 8 + forms 11 + reports 7 + content 14 — all **0 fail** |

---

## Related documents

| Doc | Role |
|-----|------|
| `docs/testing/V5_DEMO_E2E_SMOKE_TEST.md` | Hosted manual smoke |
| `docs/testing/V5_DEMO_TENANT_READINESS.md` | Demo readiness |
| `docs/gui/V5_FULL_GUI_REGRESSION_AUDIT.md` | GUI regression notes |
| `docs/database/V4_TO_V5_MIGRATION_REHEARSAL.md` | Local migration rehearsal report |
| `docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md` | Hosted cutover (ops) |
| `docs/security/*V5*_AUDIT.md` | Security audit companions |
| `docs/performance/V5_*_AUDIT.md` | Performance audit companions |
