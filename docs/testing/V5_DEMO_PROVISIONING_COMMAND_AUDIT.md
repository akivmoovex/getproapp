# BlessBoard V5 — Demo tenant provisioning command audit

**Date:** 2026-07-19  
**Updated:** 2026-07-19 (task 63 — CLI safety hardening)  
**Branch:** `V5`  
**Mode:** Living audit — originally documentation-only; **task 63** hardened the four V5 provision CLIs (dry-run default, `--confirm`, identity match, deployment check, legacy-table refuse, GETPRO refuse, dual reports). No hosted data written.  
**Companions:** [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) · [`V5_DEMO_TENANT_REMEDIATION_PLAN.md`](./V5_DEMO_TENANT_REMEDIATION_PLAN.md) · [`V5_DEMO_SEED_TOOLING_AUDIT.md`](./V5_DEMO_SEED_TOOLING_AUDIT.md) · [`V5_DEMO_MINIMUM_DATASET.md`](./V5_DEMO_MINIMUM_DATASET.md)

**Question:** Which existing npm scripts / CLIs / seeds / UI paths can safely build or verify a V5 demo tenant (`diagnostic-church`), and where are the safety gaps?

---

## 0a. Hardening status (task 63)

| Gap from original audit | Status after task 63 |
|-------------------------|----------------------|
| Missing dry-run on provision/user/role CLIs | **Fixed** — dry-run is **default**; stdout JSON + stderr human plan |
| `platform:tenant:provision` identity presence-only | **Fixed** — full `DATABASE_IDENTITY_EXPECTED` match |
| Missing `--confirm` on demo write CLIs | **Fixed** — writes require `--confirm` |
| No deployment code verification on church CLI | **Fixed** — `--deployment` or `PLATFORM_DEPLOYMENT_CODE` or unique org domain deployment |
| GETPRO fallback risk | **Fixed** — refuse if `GETPRO_DATABASE_URL` is set |
| Legacy `public.tenants` / `public.session` | **Fixed** — refuse if present |
| Machine + human report | **Fixed** — `buildProvisionReport` / `emitProvisionReport` |
| Content/member mega-seed | **Still absent** (intentional) |
| Concurrent race test in `test:platform:provisioning` | **Still flaky** (18/19) — sequential idempotency covered by safety suite |

Shared helper: `db/scripts/lib/provisionCliSafety.js`.  
Focused tests: `npm run test:blessboard:provision-cli-safety`.

---

## 0. Audit method

Inspected (read-only):

| Area | Artifacts |
|------|-----------|
| Scripts | `package.json` npm entries |
| Platform provision | `db/scripts/platform-tenant-provision.js` · `src/platform/services/provisionPlatformTenant.js` |
| Church / branch | `db/scripts/blessboard-church-provision.js` · `src/blessboard/services/provisionBlessBoardChurch.js` |
| Domain catalogue | Same platform provision path (`platform.domains`) |
| Users / roles | `db/scripts/blessboard-user-create.js` · `blessboard-user-role-assign.js` · create/assign services |
| Seeds | `db/seeds/001_deployments.sql` · `002_products.sql` · `003_blessboard_plans.sql` via `db:migrate` / bootstrap |
| Foundation ops | `db:identity:*` · `db:bootstrap:foundation` · `db:verify:foundation` · `db:status` |
| Legacy / unsafe | `church:seed-demos` · `church:demo-admin` · `church:pilot:seed` · related |
| Plan assignment | `assignOrganizationPlan` (provision default `free`) · PA `POST /admin/organizations/:key/plan` |
| Content / ops / media | **No V5 seed CLI** — admin UI / registration only |
| Docs | Demo readiness, remediation plan, seed tooling audit |
| Tests | `test:platform:provisioning` · `test:blessboard:provisioning` (executed this audit) |

**Not executed:** any `platform:tenant:provision`, `blessboard:*:provision`, `blessboard:user:*`, `db:migrate`, `db:bootstrap:foundation`, or legacy seed against any database.

---

## 1. Tool matrix

Legend for columns:

- **Writes data:** Yes / No / Conditional  
- **Dry run:** CLI flag or mode that previews without writing  
- **Idempotent:** Safe re-run without duplicates / silent corruption  
- **Identity check:** Requires `DATABASE_IDENTITY_EXPECTED` match via `checkDatabaseIdentity` (not merely “row exists”)  
- **Confirmation:** Interactive `--confirm` or equivalent gate  
- **Rollback:** Supported teardown / revoke path

### 1.1 V5-safe / foundation path

| Tool | Purpose | Environment | Writes data | Dry run | Idempotent | Identity check | Confirmation | Rollback |
|------|---------|-------------|-------------|:-------:|:----------:|:--------------:|:------------:|----------|
| `npm run db:identity:check` | Read-only verify `platform.database_identity` (optional expected-key match) | `DATABASE_URL`; optional `DATABASE_IDENTITY_EXPECTED` | **No** | N/A (read-only) | N/A | **Yes** when expected set | None | N/A |
| `npm run db:status` | Migration/seed apply status | `DATABASE_URL` | **No** | N/A | N/A | No | None | N/A |
| `npm run db:verify:foundation` | Allowlist schema/object verify | `DATABASE_URL` (+ identity expect in bootstrap flows) | **No** | N/A | N/A | Via verify helpers | None | N/A |
| `npm run db:identity:init` | Write singleton identity row | `DATABASE_URL` + expected key; `--env` | **Yes** | **No** | Upsert/ensure (conflict-safe) | Key required | **`--confirm` required** | **None** — escalate |
| `npm run db:migrate` | Apply `db/migrations/*` + `db/seeds/*` | `DATABASE_URL` | **Yes** | **No** | Tracked migrations; seeds `ON CONFLICT` | No expected-key gate on migrate itself | None (ops policy only) | **None** |
| `npm run db:bootstrap:foundation` | Migrate + ensure identity + verify | `DATABASE_URL`, `DATABASE_IDENTITY_EXPECTED`; optional `DATABASE_IDENTITY_ENV`, `FOUNDATION_ALLOW_LOCALHOST` | **Yes** | **No** | Migrate skip-applied; identity ensure | **Yes** | Manual script only (not startup) | **None** |
| Seed `001_deployments.sql` | `blessboard-com-v4` + `blessboard-org-v5` deployment rows | Via migrate/bootstrap | **Yes** | No | **Yes** `ON CONFLICT DO UPDATE` | N/A | N/A | None |
| Seed `002_products.sql` | Product catalogue (`blessboard`, `getpro`, `ngo`) | Via migrate/bootstrap | **Yes** | No | **Yes** upsert | N/A | N/A | None |
| Seed `003_blessboard_plans.sql` | Plan + FEATURE_KEYS catalogue (Foundation/Growth/Network display) | Via migrate/bootstrap | **Yes** | No | **Yes** upsert | N/A | N/A | None |
| `npm run platform:tenant:provision` | Org + BlessBoard enrolment + domain (+ default **Foundation** `plan_key=free` if no sub) | `DATABASE_URL` + `DATABASE_IDENTITY_EXPECTED`; unset `GETPRO_DATABASE_URL` | **Only with `--confirm`** | **Yes — default** | **Yes** — match → `already_provisioned` / dry-run no-op | **Yes** — full key match | **`--confirm` required** | **TOOLING GAP** |
| `npm run blessboard:church:provision` | Church + HQ branch (`is_primary=true`) | Same + `--deployment` (or env / unique org domain) | **Only with `--confirm`** | **Yes — default** | **Yes** | **Yes** | **`--confirm` required** | **TOOLING GAP** |
| `npm run blessboard:user:create` | Create `blessboard.users` (bcrypt) | Same; password only on `--confirm` | **Only with `--confirm`** | **Yes — default** | **Partial** — same email+display+password → `already_exists` | **Yes** | **`--confirm` required** | **TOOLING GAP** (no deactivate) |
| `npm run blessboard:user:role:assign` | Assign `platform_admin` / `church_hq_admin` / `branch_admin` | Same | **Only with `--confirm`** | **Yes — default** | **Yes** — `already_assigned` / dry-run equivalents | **Yes** | **`--confirm` required** | **TOOLING GAP** (no revoke) |
| PA UI `POST /admin/organizations/:organizationKey/plan` | Assign Foundation / Growth / Network (`free` / `growth` / `professional`) | Live apex session + CSRF | **Yes** | **No** | Subscription replace path (service-level) | App DB identity at runtime | Authz + CSRF | Via re-assign / escalate |
| Content / module / media admin UIs | Publish Home/About; ops samples; media upload | Tenant/HQ/BA session | **Yes** | No | UI-dependent | Session/host context | CSRF on mutations | Soft-archive / unpublish where product allows |
| Tenant `/register` + BA approve | Member user + primary membership | Tenant host reachable | **Yes** | No | Workflow-dependent | Routing + authz | UI | Reject/leave pending via UI |

### 1.2 Explicitly unsafe / invalid for V5 foundation demo

| Tool | Purpose | Environment | Writes data | Dry run | Idempotent | Identity check | Confirmation | Rollback |
|------|---------|-------------|-------------|:-------:|:----------:|:--------------:|:------------:|----------|
| `npm run church:seed-demos` | V4-style catalogue demos (`demo`/`demo2`) via `seedChurchDemoOrganization` → `public.church_*` (+ tenants path) | `DEPLOYMENT_ENV=testing` + `DATABASE_URL` | **Yes — wrong schema generation** | **No** | Claims seed-if-missing | **No** V5 identity match | Testing-env gate only | Separate church cleanup (not V5 teardown) |
| `npm run church:demo-admin` | Upsert V4 branch admin; **default password in source** | `DATABASE_URL` **or `GETPRO_DATABASE_URL`** | **Yes** | No | Upsert | No | None | Manual |
| `npm run church:demo-reset` | Reset church demo data | Church schema | **Yes** | No | Destructive intent | No | Check script | N/A |
| `npm run church:pilot:seed` | Controlled V4/church-schema pilot tenants | testing + `--confirm` | **Yes** | No | Pilot service | No V5 foundation key | **`--confirm`** | `church:pilot:cleanup` |
| `church:pilot:*` (rehearse/cleanup/report) | Pilot lifecycle | Church schema | Mixed | Mixed | Pilot-specific | No | Varies | Cleanup script |
| `npm run church:v5:deploy-init` | Hostinger church-schema + identity helper — **not** foundation tenant provision | Ops | Conditional | No | Partial | Church identity helper | Script-specific | N/A |
| `migrate:v4-to-v5:*` | Bulk V4→V5 migration | Explicit source/target URLs | dry-run **No** write; apply **Yes** | **Yes** (dry-run mode) | Designed idempotent | **Yes** expected identity on target | apply needs `--confirm` | Not a demo seed |

### 1.3 Test-only helpers (not operator demo tools)

| Helper | Notes |
|--------|-------|
| `tests/helpers/foundationDb.js` | Ephemeral local foundation DBs |
| `tests/helpers/blessboardV5Fixtures.js` | In-test tenant context |
| `tests/helpers/migrationFixtureDb.js` | May create intentional V4 `public.tenants` **for migration tests only** |
| `tests/helpers/pgTestSeed.js` / church pilot fixtures | Legacy church tests |

Do **not** reuse test helpers as hosted demo provisioners.

---

## 2. Coverage vs demo readiness requirements

| Requirement | Covered by | Status |
|-------------|------------|--------|
| Platform deployment (`blessboard-org-v5`) | Seed `001` via migrate/bootstrap | **READY tooling** |
| BlessBoard product row | Seed `002` | **READY tooling** |
| Organization | `platform:tenant:provision` | **READY tooling** |
| Organization–product enrolment | same | **READY tooling** |
| Tenant domain | same (`--hostname`, `--domain-type`, `--deployment`) | **READY tooling** |
| Church | `blessboard:church:provision` | **READY tooling** |
| HQ branch | same (`--hq-branch-key`) | **READY tooling** |
| Primary branch | same (`hq` + `is_primary=true`) | **READY tooling** |
| Foundation plan assignment | Provision auto-assigns `plan_key=free` if no subscription | **READY tooling** (default only) |
| Growth / Network plan assignment | **No CLI** — PA org plan POST only | **GAP (ops UI)** |
| Platform-admin test account | `blessboard:user:create` + `role:assign` `platform_admin` | **READY tooling** |
| HQ-admin test account | create + `church_hq_admin` | **READY tooling** |
| Branch-admin test account | create + `branch_admin` + `--branch-key hq` | **READY tooling** |
| Role assignments | `blessboard:user:role:assign` | **READY tooling** |
| Member test account + primary membership | **No CLI** — `/register` + BA approve | **GAP (UI + routing)** |
| Public content (Home/About) | **No seed CLI** — content admin UI | **GAP** |
| Operational demo records | **No seed CLI** — module admin UIs | **GAP** |
| Media metadata (+ blob) | **No seed CLI** — media picker UI | **GAP** |

Aligns with readiness MISSING items B02–B04 for personas/content; catalogue 1–7 already READY on hosted audit.

---

## 3. Risk findings (required checks)

### 3.1 Missing dry-run support

| Tool | Finding |
|------|---------|
| `platform:tenant:provision` | No `--dry-run` |
| `blessboard:church:provision` | No `--dry-run` |
| `blessboard:user:create` | No `--dry-run` |
| `blessboard:user:role:assign` | No `--dry-run` |
| `db:migrate` / `db:bootstrap:foundation` | No dry-run preview of pending writes |

Operators cannot preview hosted writes without writing. (Contrast: `migrate:v4-to-v5:dry-run` exists but is **not** a demo provisioner.)

### 3.2 Missing / weak database identity check

| Tool | Finding |
|------|---------|
| `platform:tenant:provision` | Checks identity **table/row exists** only — **does not** require `DATABASE_IDENTITY_EXPECTED` to match `identity_key` |
| `db:migrate` | No expected-identity gate |
| Legacy `church:seed-demos` / `church:demo-admin` | No V5 foundation identity match; demo-admin accepts **`GETPRO_DATABASE_URL`** |
| Church/user CLIs | **Correct** — full `checkDatabaseIdentity` |

### 3.3 Missing explicit confirmation

| Tool | Finding |
|------|---------|
| Platform / church / user / role provision CLIs | No `--confirm` (rely on ops phrase in remediation plan) |
| `db:identity:init` | **Has** `--confirm` (good) |
| `church:pilot:seed` | Has `--confirm` but **wrong product path** for V5 foundation demo |

### 3.4 Non-idempotent / partial idempotency

| Tool | Behavior |
|------|----------|
| `blessboard:user:create` | Re-run with same password → `already_exists` **ok**; different password → fail closed (`identity_conflict`). **Does not update** password or display. |
| Plan change | No idempotent “ensure Network” CLI — only PA UI |
| Content/UI | Manual; duplicates possible if operators re-create |

Provision org/church paths fail closed on attribute mismatch (no silent rewrite of conflicting org/church/domain keys).

### 3.5 Commands that could accidentally target V4 / wrong generation

| Tool | Risk |
|------|------|
| `church:seed-demos` | Writes **`public.church_*`** catalogue demos; readiness marks **INVALID** on V5 foundation; must not run against `blessboard-platform-v5` |
| `church:demo-admin` / `church:demo-reset` / `church:pilot:*` | Church-schema / V4 paths; may use `GETPRO_DATABASE_URL` |
| `db:migrate` with wrong `DATABASE_URL` | Can mutate whichever DB the URL points at |
| `platform:tenant:provision` without expected-key match | Can write to a DB that has *some* identity row but not the intended key |
| Seeds `001` include `blessboard-com-v4` row | Harmless catalogue row on V5 DB; does **not** imply V4 app attach — still do not run legacy church seeds |

### 3.6 Commands that expose temporary credentials

| Tool | Finding |
|------|---------|
| `blessboard:user:create` | Success JSON prints email/display/`userId` — **not** password. Prefer `--password-stdin`. `--password=` risks shell history. |
| `church:demo-admin` | **Hardcoded default** `DemoAdmin@2026!` in source if env unset — **credential exposure / weak demo secret** |
| `seedChurchDemoOrganization` | Same class of default demo admin password constant |
| Docs / remediation templates | Placeholders only (correct) |

### 3.7 Commands that silently overwrite records

| Tool | Finding |
|------|---------|
| Seeds `001`–`003` | `ON CONFLICT DO UPDATE` **does** overwrite display/status/feature columns — intentional catalogue refresh, not org data |
| Platform / church provision | **No** silent overwrite of conflicting identity fields — returns `*_conflict` |
| User create | **No** password overwrite on conflict |
| Role assign | **No** silent scope rewrite; duplicate active grant → `already_assigned` |
| Legacy demo-admin | Upserts V4 branch admin (overwrite path on church schema) — **do not use on V5** |

---

## 4. Focused provisioning tests (this run)

| Command | Result |
|---------|--------|
| `npm run test:platform:provisioning` | **18/19 pass · 1 fail** — see §Verification |
| `npm run test:blessboard:provisioning` | **12/12 pass** |
| `git diff --check` | **Clean** (no whitespace errors) |

These suites exercise service/CLI argument safety and idempotent provision against **ephemeral test DBs** — they are not hosted writes.

**Platform failure detail (observed twice this audit):** `unique-constraint race handling does not create duplicates` — concurrent `Promise.all` of identical `provisionPlatformTenant` calls; assertion `a.ok && b.ok` failed. Not investigated or fixed here (tooling changes out of scope). Treat as a **known suite gap** for concurrent race recovery, separate from the demo CLI safety conclusions above.

---

## 5. Report (required)

### 1. Tools found

**Safe/read-only:** `db:identity:check`, `db:status`, `db:verify:foundation`.  
**Foundation write path:** `db:identity:init` (confirm), `db:migrate`, `db:bootstrap:foundation`, seeds 001–003.  
**Demo catalogue path:** `platform:tenant:provision`, `blessboard:church:provision`.  
**Demo personas path:** `blessboard:user:create`, `blessboard:user:role:assign`.  
**Package upgrade path:** PA UI plan assign only (no CLI).  
**Content/ops/media/member:** Admin UI + registration only.  
**Unsafe for V5 foundation demo:** `church:seed-demos`, `church:demo-admin`, `church:demo-reset`, `church:pilot:*`, `church:v5:deploy-init` (not the foundation tenant graph).

**Test note:** Platform provision suite currently **fails** one concurrent-race case (18/19); church provision suite **passes** 12/12. See §6.

### 2. Safe tools

| Class | Tools |
|-------|--------|
| Always safe (no write) | `db:identity:check`, `db:status`, `db:verify:foundation` |
| Supervised V5 writes (identity-gated) | `blessboard:church:provision`, `blessboard:user:create`, `blessboard:user:role:assign` |
| Supervised V5 writes (weaker identity gate) | `platform:tenant:provision` — usable **only** after operator confirms URL + identity |
| Catalogue seeds (via bootstrap/migrate) | `001` / `002` / `003` — idempotent upsert; supervised on hosted |
| Plan assign | PA UI with authz/CSRF — supervised |

### 3. Unsafe tools

| Tool | Why |
|------|-----|
| `church:seed-demos` | Wrong schema generation for V5 foundation; `public.church_*` |
| `church:demo-admin` | V4 branch admins; `GETPRO_DATABASE_URL`; hardcoded default password |
| `church:demo-reset` / `church:pilot:*` | Church-schema pilot/demo — not `diagnostic-church` V5 graph |
| Invented INSERT SQL | Policy / bypasses services |
| Any write CLI pointed at hosted without identity + confirmation | Wrong-DB risk |
| `migrate:v4-to-v5:apply` as “demo seed” | Bulk migration, not one-tenant demo |

### 4. Missing capabilities

| Gap | Impact |
|-----|--------|
| No `--dry-run` on provision/user/role CLIs | Cannot preview hosted writes |
| `platform:tenant:provision` lacks expected-identity **match** | Weaker than sibling CLIs |
| No `--confirm` on demo write CLIs | Relies on process/docs only |
| No Growth/Network plan CLI | Network demo needs PA UI or escalate |
| No member / membership CLI | Needs tenant registration reachability |
| No CMS / ops / media seed CLI | UI-only (intentional per prior audits) |
| No user deactivate / role revoke / catalogue teardown | Cleanup escalate |
| No single orchestrator | Multi-step supervised order (by design) |

### 5. Recommended provisioning sequence

Do **not** run from this audit. When authorized (local or `CONFIRM HOSTED WRITE …`):

1. **Read-only:** `db:identity:check` → `db:status` → `db:verify:foundation`
2. **Foundation (empty local only):** `db:bootstrap:foundation` — deployments + products + plans
3. **Catalogue:** `platform:tenant:provision` (org, enrolment, domain) — expect `already_provisioned` on re-run
4. **Church:** `blessboard:church:provision` (church + HQ primary)
5. **Package:** leave Foundation **or** PA assign `growth` / `professional` for Growth/Network demos
6. **Staff:** `blessboard:user:create` ×3 + `blessboard:user:role:assign` (PA, HQ, BA)
7. **CMS + ops + media:** Admin UIs only
8. **Member:** Tenant `/register` + BA approve (needs tenant public reachability)
9. **Verify:** Re-check [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md)

**Never** insert `church:seed-demos` / `church:demo-admin` / pilot seeds into this sequence for V5 foundation.

### 6. First tooling fix required

**Completed in task 63** for the four V5 demo CLIs (identity match, dry-run default, `--confirm`, deployment check, GETPRO/legacy refuse, dual reports).

**Remaining (optional follow-ups):**

1. Fix concurrent race flake in `test:platform:provisioning` (`unique-constraint race handling`).
2. Content/member/ops seed CLIs remain intentionally absent — use UI workflows.

### 7. Suggested commit message

```
docs(testing): audit V5 demo tenant provisioning commands

Catalogue npm CLIs, seeds, and legacy paths for diagnostic-church demo setup;
flag identity/dry-run gaps and forbid V4 church seed tools on foundation.
```

---

## 6. Verification

| Gate | Result |
|------|--------|
| Provisioning commands executed against hosted ops DB | **Not run** (per task) |
| Tooling code modified | **Yes** — task 63 safety hardening only |
| `npm run test:blessboard:provision-cli-safety` | **PASS** — 12/12 |
| `npm run test:blessboard:provisioning` | **PASS** — 12/12 |
| `npm run test:platform:provisioning` | **18/19** — concurrent race flake remains |
| `git diff --check` | *(re-check after task 63)* |

---

## 7. Stop

Audit complete. **No tooling changes.** Next work requires an explicit prompt (e.g. implement identity match + dry-run on platform provision).
