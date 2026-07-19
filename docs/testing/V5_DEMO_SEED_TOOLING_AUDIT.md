# BlessBoard V5 — Demo seed & provisioning tooling audit

**Date:** 2026-07-19  
**Mode:** Documentation audit only — **no tools executed**, no data written  
**Companions:** [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) · [`V5_DEMO_TENANT_REMEDIATION_PLAN.md`](./V5_DEMO_TENANT_REMEDIATION_PLAN.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md)

**Question:** Can existing tooling safely and idempotently create **one** complete V5 demo tenant (catalogue + personas + content)?

**Short answer:** Catalogue (deployment/product/org/enrolment/domain/church/HQ/primary) — **YES** via foundation seeds + provision CLIs. Staff users/roles — **YES** via user CLIs (partially idempotent). Public/operational content + member — **NO dedicated V5 seed**; use admin UI / registration. Legacy `church:seed-demos` — **UNSAFE for V5 foundation**.

---

## 0. Capability matrix (desired demo graph)

| Capability | Can existing tooling create it? | Primary tool | Idempotent? | Notes |
|------------|--------------------------------|--------------|-------------|-------|
| Deployment (`blessboard-org-v5`) | **YES** | `db/seeds/001_deployments.sql` via migrate/bootstrap | **YES** (`ON CONFLICT DO UPDATE`) | Not created by tenant provision CLI |
| Product (`blessboard`) | **YES** | `db/seeds/002_products.sql` | **YES** | Catalogue only |
| Organization | **YES** | `platform:tenant:provision` | **YES** (`already_provisioned`) | Conflict if mismatched attrs |
| Enrolment | **YES** | same | **YES** | |
| Domain | **YES** | same | **YES** | Hostname unique |
| Church | **YES** | `blessboard:church:provision` | **YES** | |
| HQ branch | **YES** | same | **YES** | |
| Primary branch | **YES** | same (`hq` + `is_primary`) | **YES** | Second primary would conflict |
| Test users | **YES** | `blessboard:user:create` | **Partial** (`already_exists` fails closed) | No password update CLI |
| Roles | **YES** | `blessboard:user:role:assign` | **YES** (`already_assigned`) | No revoke CLI |
| Public content (Home/About) | **NO CLI** | Content admin UI only | N/A | **TOOLING GAP** |
| Basic operational content | **NO CLI** | Module admin UIs only | N/A | **TOOLING GAP** |
| Member + membership | **NO CLI** | Tenant register + BA approve | N/A | **TOOLING GAP** |
| Media sample | **NO CLI** | Media picker upload UI | Soft-archive cleanup | **TOOLING GAP** |

---

## 1. Tools found (inventory)

### 1.1 V5-safe / foundation path

| npm script | Entry | Purpose |
|------------|-------|---------|
| `db:migrate` | `db/scripts/migrate.js` | Apply `db/migrations/*` + `db/seeds/*` |
| `db:status` | `db/scripts/status.js` | Read-only migration status |
| `db:identity:init` | `db/scripts/identity-init.js` | Init `platform.database_identity` (confirm flag) |
| `db:identity:check` | `db/scripts/identity-check.js` | Read-only identity verify |
| `db:bootstrap:foundation` | `db/scripts/bootstrap-foundation.js` | Migrate + identity ensure + verify (manual) |
| `db:verify:foundation` | `db/scripts/verify-foundation.js` | Read-only allowlist verify |
| `platform:tenant:provision` | `db/scripts/platform-tenant-provision.js` | Org + enrolment + domain |
| `blessboard:church:provision` | `db/scripts/blessboard-church-provision.js` | Church + HQ/primary branch |
| `blessboard:user:create` | `db/scripts/blessboard-user-create.js` | Create BlessBoard user |
| `blessboard:user:role:assign` | `db/scripts/blessboard-user-role-assign.js` | Assign role |

### 1.2 SQL seeds (via migrator)

| File | Creates |
|------|---------|
| `db/seeds/001_deployments.sql` | `blessboard-com-v4`, `blessboard-org-v5` |
| `db/seeds/002_products.sql` | `blessboard`, `getpro`, `ngo` products |
| `db/seeds/003_blessboard_plans.sql` | Plans/features display (legacy `plan_key`s) |

### 1.3 Explicitly not V5 demo-tenant tools (legacy / wrong schema generation)

| npm script | Why excluded for V5 foundation demo |
|------------|-------------------------------------|
| `church:seed-demos` | Seeds V4-style catalogue demos (`demo`/`demo2`); readiness marks **INVALID** for V5 (expects church schema / must not create legacy shapes on foundation) |
| `church:pilot:seed` / `church:demo-admin` / `church:demo-reset` | Church-pilot / V4 paths |
| `church:v5:deploy-init` | Hostinger church-schema + identity helper; **does not seed tenants**; not the foundation provision path |
| `migrate:v4-to-v5:*` | Bulk V4→V5 migration — **not** a one-tenant demo seed |

### 1.4 Test-only helpers (not operator demo seeds)

| Helper | Notes |
|--------|-------|
| `tests/helpers/foundationDb.js` | Ephemeral local DBs for tests |
| `tests/helpers/blessboardV5Fixtures.js` | In-test tenant context builders |
| `tests/helpers/migrationFixtureDb.js` | Intentional V4 `public.tenants` for migration tests only |
| `tests/helpers/pgTestSeed.js` / `churchPilotSmokeFixtures.js` | V4 church tests |

---

## 2. Per-tool documentation

### 2.1 `db:migrate` / seeds (deployment + product)

| Field | Detail |
|-------|--------|
| **Command** | `npm run db:migrate` (also inside `db:bootstrap:foundation`) |
| **Required environment** | `DATABASE_URL`. Bootstrap also needs `DATABASE_IDENTITY_EXPECTED`. Localhost may need `FOUNDATION_ALLOW_LOCALHOST=1`. |
| **Idempotency** | Migrations tracked in `platform.schema_migrations`; seeds use `ON CONFLICT DO UPDATE` / skip-if-applied bookkeeping |
| **Confirmation requirement** | No interactive confirm on migrate itself; **hosted use requires operator confirmation** (see remediation plan §0). `db:identity:init` requires `--confirm`. |
| **Created records** | Schema objects; seed rows for deployments, products, plans |
| **Update behavior** | Seed upserts deployment/product/plan display fields on conflict |
| **Rollback / cleanup** | No auto rollback; reverse migrate not offered for demo remediation |
| **Hosted-use safety** | **HIGH RISK** if pointed at wrong DB — always identity-check first. Prefer bootstrap on empty/local; hosted migrate only under cutover runbooks |

**Does not create:** organizations, churches, users, CMS content.

---

### 2.2 `db:bootstrap:foundation`

| Field | Detail |
|-------|--------|
| **Command** | `npm run db:bootstrap:foundation` |
| **Required environment** | `DATABASE_URL`, `DATABASE_IDENTITY_EXPECTED`; optional `DATABASE_IDENTITY_ENV` (default `testing`) |
| **Idempotency** | Migrate skips applied; identity ensure is safe; verify is read-only |
| **Confirmation requirement** | Manual script only (not startup). Hosted: explicit operator order |
| **Created records** | Full foundation schema + seeds + identity row |
| **Update behavior** | Re-run applies pending migrations/seeds only |
| **Rollback / cleanup** | None — do not drop hosted DBs from this tool |
| **Hosted-use safety** | Host safety gate (`FOUNDATION_ALLOW_LOCALHOST`); refuses unsafe hosts unless allowed. Still **supervised** for hosted |

---

### 2.3 `db:identity:check` / `db:verify:foundation` / `db:status`

| Field | Detail |
|-------|--------|
| **Command** | `npm run db:identity:check` · `npm run db:verify:foundation` · `npm run db:status` |
| **Required environment** | `DATABASE_URL`; identity tools need `DATABASE_IDENTITY_EXPECTED` |
| **Idempotency** | Read-only |
| **Confirmation requirement** | None |
| **Created records** | None |
| **Update behavior** | N/A |
| **Rollback / cleanup** | N/A |
| **Hosted-use safety** | **SAFE** for preflight (no writes) |

---

### 2.4 `platform:tenant:provision`

| Field | Detail |
|-------|--------|
| **Command** | `npm run platform:tenant:provision -- --organization-key … --display-name … --environment testing --product blessboard --tenant-key … --hostname … --domain-type canonical --deployment blessboard-org-v5` |
| **Required environment** | `DATABASE_URL`. Requires **identity row present** in DB. **Does not currently require `DATABASE_IDENTITY_EXPECTED` env match** (see §5 safety note). |
| **Idempotency** | **YES** — returns `already_provisioned` when org/enrolment/domain already match; conflicts on mismatched existing rows |
| **Confirmation requirement** | No CLI `--confirm` / dry-run. Hosted: remediation confirmation phrase |
| **Created records** | `platform.organizations`, `organization_products` (+ default subscription path), `platform.domains` linked to deployment |
| **Update behavior** | Does not silently rewrite conflicting org attributes — fails with `*_conflict` |
| **Rollback / cleanup** | **TOOLING GAP** — no teardown CLI |
| **Hosted-use safety** | Safe **if** URL + identity correct; weaker than church/user CLIs on expected-key check |

**Prerequisite:** Deployment + product seed rows must exist (`deployment_not_found` / `product_not_found` otherwise).

---

### 2.5 `blessboard:church:provision`

| Field | Detail |
|-------|--------|
| **Command** | `npm run blessboard:church:provision -- --organization-key … --church-key … --display-name … --environment testing --hq-branch-key hq --hq-branch-name …` |
| **Required environment** | `DATABASE_URL`, `DATABASE_IDENTITY_EXPECTED` (checked via `checkDatabaseIdentity`) |
| **Idempotency** | **YES** — `already_provisioned` when church + HQ already match |
| **Confirmation requirement** | No dry-run. Hosted: operator confirmation |
| **Created records** | `blessboard.churches`, HQ `blessboard.branches` (`is_primary=true`) |
| **Update behavior** | Conflict on mismatched church/branch keys or environment |
| **Rollback / cleanup** | **TOOLING GAP** |
| **Hosted-use safety** | **GOOD** — identity key enforced |

**Prerequisite:** Active BlessBoard enrolment on org (`missing_blessboard_enrolment` otherwise).

---

### 2.6 `blessboard:user:create`

| Field | Detail |
|-------|--------|
| **Command** | `printf '%s' '<PASSWORD>' \| npm run blessboard:user:create -- --email … --display-name … --password-stdin` |
| **Required environment** | `DATABASE_URL`, `DATABASE_IDENTITY_EXPECTED` |
| **Idempotency** | **Partial** — same email → `already_exists` (exit non-zero); does not update password/display |
| **Confirmation requirement** | No dry-run. Prefer `--password-stdin` (never commit passwords) |
| **Created records** | `blessboard.users` (+ credential hash) |
| **Update behavior** | No update path in CLI |
| **Rollback / cleanup** | **TOOLING GAP** — no deactivate CLI |
| **Hosted-use safety** | **GOOD** — identity enforced; password not printed in success JSON beyond email/display |

---

### 2.7 `blessboard:user:role:assign`

| Field | Detail |
|-------|--------|
| **Command** | `npm run blessboard:user:role:assign -- --email … --organization-key … --role platform_admin\|church_hq_admin\|branch_admin [--church-key …] [--branch-key …]` |
| **Required environment** | `DATABASE_URL`, `DATABASE_IDENTITY_EXPECTED` |
| **Idempotency** | **YES** — `already_assigned` when grant exists |
| **Confirmation requirement** | No dry-run. Hosted: confirmation |
| **Created records** | `blessboard.user_roles` |
| **Update behavior** | Scope validation; staff entitlement gates may block |
| **Rollback / cleanup** | **TOOLING GAP** — no revoke CLI |
| **Hosted-use safety** | **GOOD** |

---

### 2.8 Public / operational content / media / member

| Field | Detail |
|-------|--------|
| **Command** | **None** (V5). Use HQ/BA content, module, media UIs; member via `/register` + BA approve |
| **Required environment** | Live app with sessions; tenant host reachable for member/CMS public |
| **Idempotency** | UI-dependent (re-publish / soft-archive) |
| **Confirmation requirement** | Hosted UI writes need supervision |
| **Created records** | `public_pages`, announcements, events, etc., media assets, members |
| **Update behavior** | Product workflows |
| **Rollback / cleanup** | Soft-archive / unpublish / reject registration via UI where available |
| **Hosted-use safety** | Safe when using product authz; no bulk seed |

---

### 2.9 `church:seed-demos` — UNSAFE for V5 foundation demo

| Field | Detail |
|-------|--------|
| **Command** | `npm run church:seed-demos` |
| **Required environment** | `DEPLOYMENT_ENV=testing`, `DATABASE_URL` |
| **Idempotency** | Script claims idempotent for catalogue demos |
| **Confirmation requirement** | Testing-env gate only |
| **Created records** | V4-style church catalogue demos (`demo` / `demo2` via `seedChurchDemoOrganization`) — **not** platform/blessboard V5 provision graph |
| **Update behavior** | Seed-if-missing |
| **Rollback / cleanup** | Separate church cleanup scripts (not V5 teardown) |
| **Hosted-use safety** | **UNSAFE on V5 foundation DB** — readiness classifies as **INVALID**; risk of wrong schema generation / legacy assumptions |

**Do not use** to remediate `diagnostic-church` on `blessboard-platform-v5`.

---

## 3. Missing capabilities

| Gap | Impact |
|-----|--------|
| No V5 public-content seed CLI | Home/About must be published in UI |
| No V5 operational module seed CLI | Smoke samples via UI |
| No member/membership seed CLI | Registration workflow required |
| No media seed CLI | Upload via picker |
| No dry-run on provision/user/role CLIs | Operators cannot preview writes without writing |
| No teardown / revoke / user-deactivate CLIs | Cleanup is manual/escalation |
| No single “demo tenant” orchestrator | Multi-step supervised order required (by design — avoid giant seed) |

---

## 4. Unsafe / disallowed tools for this goal

| Tool | Risk |
|------|------|
| `church:seed-demos` | Wrong generation for V5 foundation; forbidden by readiness |
| `church:pilot:seed`, `church:demo-reset`, V4 demo helpers | Legacy church schema |
| Invented INSERT SQL | Policy violation; bypasses services/identity |
| Hardcoded demo passwords in repo | Forbidden |
| `migrate:v4-to-v5:apply` as “demo seed” | Bulk migration, not one tenant |
| Pointing any write CLI at hosted without identity check + confirmation | Wrong-DB risk |

---

## 5. Idempotency status (summary)

| Tool | Status |
|------|--------|
| SQL seeds 001–003 | **Idempotent** upsert |
| `platform:tenant:provision` | **Idempotent** match → `already_provisioned`; else conflict |
| `blessboard:church:provision` | **Idempotent** same |
| `blessboard:user:create` | **Not re-entrant success** — duplicate email fails (`already_exists`) |
| `blessboard:user:role:assign` | **Idempotent** (`already_assigned`) |
| Content/UI | Manual |

### Safety improvement noted (not implemented)

`platform:tenant:provision` verifies that `platform.database_identity` **exists**, but unlike church/user CLIs it does **not** require `DATABASE_IDENTITY_EXPECTED` to **match** the row.

**Recommendation (report only):** Add the same `checkDatabaseIdentity` gate (and optionally `--dry-run`) before implementing any change. Per task rules: **stopped before implementing**.

---

## 6. Recommended supervised execution order

Aligns with [`V5_DEMO_TENANT_REMEDIATION_PLAN.md`](./V5_DEMO_TENANT_REMEDIATION_PLAN.md). Do **not** run from this audit.

1. **Read-only:** `db:identity:check` → `db:status` → `db:verify:foundation`
2. **Foundation (only if empty local/new DB):** `db:bootstrap:foundation` — creates deployment + product seeds
3. **Catalogue:** `platform:tenant:provision` (org, enrolment, domain)
4. **Church:** `blessboard:church:provision` (church, HQ, primary)
5. **Staff:** `blessboard:user:create` ×3 + `blessboard:user:role:assign` (PA, HQ, BA)
6. **CMS + samples + media:** Admin UI (no seed CLI)
7. **Member:** Tenant register + BA approve (needs tenant routing reachability)
8. **Verify:** Re-check readiness matrix; then smoke plan

Never insert `church:seed-demos` into this order for V5 foundation.

---

## 7. Hosted-use policy (audit conclusion)

| Action | Hosted safety |
|--------|----------------|
| Identity/status/verify | Safe |
| Bootstrap/migrate on hosted | Supervised only; prefer cutover docs |
| Provision + user/role CLIs | Supervised; confirm target identity |
| UI content/media/member | Supervised |
| Legacy church seeds | **Do not run** |

No tool in the V5-safe set creates `public.tenants` / `public.session`. Migration test fixtures that do so are **test-only** and must not be reused as demo seeds.

---

## 8. Verdict

| Question | Answer |
|----------|--------|
| Can tooling create one **catalogue-complete** demo tenant idempotently? | **YES** (seeds + two provision CLIs) |
| Can tooling create **full E2E** demo (users + CMS + ops + member) via seeds alone? | **NO** — users/roles via CLI; content/member via UI; no giant seed (correctly avoided) |
| Should a new mega demo seed be added? | **NO** (task constraint + safer stepwise supervision) |
| Is the tooling set safe enough for supervised hosted remediation? | **YES**, with identity checks + confirmation; strengthen platform provision identity match as a follow-up |

---

## 9. Suggested commit message

```
docs(testing): audit V5 demo seed and provisioning tooling

Document which CLIs/seeds can idempotently build a demo tenant, mark legacy seed paths unsafe, and note identity/dry-run gaps without implementing them.
```
