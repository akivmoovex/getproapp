# ActiveClinic V6 — AC-V6-01 Environment and Shared-Infrastructure Audit

**Prompt:** AC-V6-01  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_AUDIT_PARTIAL`  
**Code changes:** none (read-only)

## Environment evidence

| Check | Result |
|-------|--------|
| 1. Current Git branch | **`V5`** — branch **`V6` does not exist** (local or remote) |
| 2. Current commit SHA | `ba1c1e95c2680a3d0d50f4a40414c8884a91916c` (`ba1c1e95` — Roles and permissions UI) |
| 3. Working-tree status | Dirty: modified `docs/gui/STITCH_SCREEN_MAP.md`; untracked `.cursor/rules/activeclinic-stitch-isolation.mdc`, `docs/activeclinic/`, `docs/stitch-project-map.md` |
| 4. Runtime / entry | `npm start` → `node index.js` → `server.js`; Node `>=20` |
| 5. Database identity guard | CLI: `DATABASE_IDENTITY_EXPECTED` via `db/scripts/lib/databaseIdentity.js`. HTTP: profile `expectedDatabaseEnvironment` vs `platform.database_identity.environment_code` (`blessBoardOrgDbGate.js`). Identity key **not** checked at HTTP start. |
| 6. Deployment profiles | `src/platform/config/deploymentProfiles.js` — BlessBoard-only authoritative profiles |
| 7. Migration ledger | `platform.schema_migrations` via `db/scripts/lib/migrator.js`; `MODULE_ORDER = ["platform","blessboard","getpro","ngo"]` — **no `activeclinic` module** |
| 8. Schemas / tenancy | `platform` + `blessboard` (+ stub `getpro`/`ngo`). Orgs via `platform.organizations` + explicit `platform.organization_products` enrolment |

**Gate for AC-V6-02:** create branch `V6` from an agreed base (recommend current `V5` tip), park or commit Stitch isolation docs, then implement only on `V6`.

---

## 1. Existing architecture map

```
index.js
  └─ server.js
       ├─ bootstrap / DB URL gates
       ├─ assertDeploymentProfileOrExit
       ├─ assertAuthoritativeProfileRuntimePairingOrExit
       └─ runtimeMode?
            ├─ v5-foundation → src/platform/http/v5FoundationServer.js
            │     ├─ platform host context / sessions / CSRF / audit / platform-admin
            │     └─ heavily mounts src/blessboard/http/* (church product)
            └─ unprofiled → server.legacy.js (GetPro marketplace + V4 church)
```

| Layer | Location | Role today |
|-------|----------|------------|
| Platform Core (partial) | `src/platform/**`, `db/migrations/platform/**` | Deployments, orgs, products, domains, sessions, audit, entitlements, support contexts |
| BlessBoard product | `src/blessboard/**`, `db/migrations/blessboard/**`, `views/blessboard/**` | Churches, branches, members, RBAC catalogue, websites, pastoral, giving |
| Legacy GetPro | `server.legacy.js`, `src/auth`, `src/routes`, `src/tenants`, `views/admin` | Marketplace / CRM / field agent |
| ActiveClinic | Design docs only | Stitch project `12272131183982732110`; **no** `src/activeclinic/` |

---

## 2. Shared-component inventory (classification)

Legend: **A** reusable · **B** BlessBoard-specific but generalizable · **C** keep BlessBoard-only · **D** legacy GetPro · **E** new ActiveClinic required · **F** unsafe coupling

| Area | Classification | Primary paths |
|------|----------------|---------------|
| Entry / bootstrap | A / B | `index.js`, `server.js`, `src/startup/bootstrap.js` |
| Deployment profile *pattern* | B | `deploymentProfiles.js`, `platformDeploymentCode.js` |
| BlessBoard profile values | C | `blessboard-com-production`, `blessboard-org-staging` |
| Migrator + ledger | A | `db/scripts/lib/migrator.js`, `platform.schema_migrations` |
| DB identity CLI | A | `db/scripts/lib/databaseIdentity.js` |
| Organizations / products / domains | A | `platform.organizations`, `organization_products`, `domains`, `products` |
| Hostname resolution | A | `resolveHostname.js`, `domainRepository.js`, `loadPlatformHostContext.js` |
| V5 sessions + cookies | A / B | `v5SessionCookie.js` (profile-driven names), `create/read/revokeV5Session.js` |
| CSRF *pattern* | A | HMAC double-submit in `v5Csrf.js` |
| CSRF cookie name | **F** | Hard-coded `blessboard_org_csrf` |
| Platform audit | A | `auditEventService.js`, `platform.audit_events` |
| Support mode (V5) | A / B | `platform.support_contexts`, `platformSupportModeService.js` |
| Plans / entitlements | A / B | `platform.plans`, `entitlementService.js` (defaults product to blessboard — **F** risk) |
| Platform admin shell | B | `platformAdminRoutes.js`, nav/shell locals |
| Login / password / invites | B | `authenticateBlessBoardUser.js`, invite/password-reset services |
| Users table | **F** / B | `blessboard.users` — `platform.deployment_sessions.user_id` FK → BlessBoard |
| RBAC engine | B | `blessBoardRbacAuthorizationService.js`, `blessboard.permissions/roles/assignments` |
| Branches / churches / websites | C | Entire BlessBoard church domain |
| Legacy GetPro stack | D | `server.legacy.js`, `src/auth`, marketplace routes |
| ActiveClinic domain | E | Schema, routes, RBAC, shell, facilities — none yet |
| Media storage factory | B | `createMediaStorage.js` |
| Phone/OTP foundation | B | migrations `072–074`, phone OTP services (Zambia readiness pattern) |

---

## 3. BlessBoard coupling findings

1. **`v5FoundationServer.js` is a BlessBoard app shell** — imports dozens of `src/blessboard/http/*` routers; not a product-neutral registrar.
2. **Identities live in `blessboard.users`** — sessions FK to that table (`006_deployment_session_product_fks.sql`). “One global platform user” is **not** true today; users are product-schema.
3. **RBAC catalogue is church-scoped** — permissions/roles in `blessboard.*`; role assignments reference `church_id` / `branch_id`.
4. **Branches are product-owned** — platform docs/migrations state branches are not shared across products; facilities must be ActiveClinic-owned.
5. **CSRF cookie hard-coded** to `blessboard_org_csrf` even when session cookie is `blessboard_com_sid`.
6. **`deployments.application_code` CHECK** allows only `blessboard|getpro|ngo|platform` — must add `activeclinic` additively.
7. **Entitlement defaults** lean BlessBoard (`product_key` default).
8. **Startup messaging / gates** named BlessBoard (`assertBlessBoardOrgDbIsolationOrExit`) but some mechanics are reusable.

---

## 4. Database reuse findings

**Safe to share one PostgreSQL/Supabase instance:**

- `platform.*` already models multi-product orgs via **explicit** `organization_products` (unique org+product; status; `product_tenant_key`).
- Hostname → deployment → product → org resolution already fails closed on deployment mismatch.
- Migration ledger is module-scoped; ActiveClinic can add `db/migrations/activeclinic/` once `MODULE_ORDER` includes it.

**Already satisfies AC-V6-03 intent (prefer existing):**

- Prefer **reuse/adapt** `platform.organization_products` rather than inventing a parallel enablement table.
- Seed `platform.products` with `activeclinic` (today seeds: `blessboard`, `getpro`, `ngo`).

**Must not:**

- Auto-enrol existing orgs into ActiveClinic.
- Point clinical data at `blessboard.churches` / `branches`.
- Weaken tenant filters or FKs.

**Open identity decision (blocks clean AC-V6-05 design):**

| Option | Pros | Cons |
|--------|------|------|
| Keep product users (`activeclinic.users`) | Clear isolation; matches current BlessBoard pattern | Duplicates login identities; harder “one global user” |
| Lift users to `platform.users` | True shared identity | Large migration; touches BlessBoard sessions FK — high regression |
| Share `blessboard.users` for ActiveClinic | Fast reuse | **Unsafe** product coupling (**F**) — reject |

**Recommendation:** For V6 foundation, mirror the BlessBoard pattern with `activeclinic.users` *or* introduce additive `platform.users` with dual-read adapters — decide in AC-V6-05 with a spike; do **not** FK ActiveClinic sessions to `blessboard.users`.

---

## 5. Proposed product-isolation model

```
Platform Core (src/platform, db/migrations/platform)
  ↑ depends on
  ├─ BlessBoard (src/blessboard, db/migrations/blessboard)     product_key=blessboard
  └─ ActiveClinic (src/activeclinic, db/migrations/activeclinic) product_key=activeclinic

Rules:
- Platform Core never imports product business modules.
- Product modules may use Platform Core only.
- Deployment profile selects product + cookies + domain + runtime.
- Route registration: registerPlatformRoutes / registerBlessBoardRoutes / registerActiveClinicRoutes
- Org access requires organization_products row for that product_code.
- OU model: BlessBoard branches ≠ ActiveClinic facilities.
```

---

## 6. Proposed directory and module structure

```
src/platform/                 # shared: config, session, csrf (parameterized), host, audit, admin spine
src/blessboard/               # unchanged church product (C)
src/activeclinic/             # NEW
  config/
  http/                       # login, shell, facilities (later)
  services/
  repositories/
  rbac/
views/activeclinic/
public/activeclinic/
db/migrations/activeclinic/   # NEW module in MODULE_ORDER after platform
db/seeds/                     # additive: activeclinic product + deployment row
docs/activeclinic/            # architecture / Hostinger / phases
```

`server.js` should remain a thin orchestrator (do **not** duplicate unless unavoidable): profile → shared foundation factory → product route packs.

---

## 7. Files likely reused unchanged

- `index.js`
- `db/scripts/lib/migrator.js` (after MODULE_ORDER +1)
- `db/scripts/lib/databaseIdentity.js`
- Most of `src/platform/repositories/{domain,auditEvent}Repository.js`
- `src/platform/services/resolveHostname.js`
- `src/platform/session/{sessionToken,createV5Session,readV5Session,revokeV5Session}.js` (possibly with nullable church/branch columns already)
- Platform audit / support-context *patterns*
- Existing BlessBoard Hostinger profiles and BlessBoard routes (untouched)

---

## 8. Files likely requiring careful refactoring

| File | Why |
|------|-----|
| `src/platform/config/deploymentProfiles.js` | Add `activeclinic-org-v6` without changing BlessBoard semantics |
| `src/platform/http/v5Csrf.js` | Profile-driven CSRF cookie name |
| `src/platform/http/v5FoundationServer.js` | Split product route registration; stop assuming BlessBoard-only |
| `src/platform/config/v5FoundationMode.js` / `v5EnvValidation.js` | Multi-product runtime pairing |
| `server.js` | Dispatch ActiveClinic profile to same/shared foundation |
| `db/migrations/platform/004_deployments.sql` or additive alter | Allow `application_code='activeclinic'` |
| `db/seeds/001_deployments.sql`, `002_products.sql` | ActiveClinic rows |
| `src/platform/services/entitlementService.js` | Remove hard BlessBoard default when product context present |
| Session table FKs | Today `user_id` → `blessboard.users`; ActiveClinic needs a safe session model |

---

## 9. New files likely required

- `src/activeclinic/**` (http, services, repositories, config)
- `db/migrations/activeclinic/001_create_activeclinic_schema.sql` (+ facilities later in AC-V6-04)
- `views/activeclinic/**` shell templates
- `public/activeclinic/**` CSS tokens
- Tests: deployment profile, product isolation, CSRF/cookie isolation
- Docs: Hostinger setup, architecture, phases (AC-V6-09/10)

---

## 10. Migration risks

- Extending `deployments.application_code` CHECK incorrectly
- Accidental backfill of `organization_products` for ActiveClinic
- Session FK to `blessboard.users` blocking ActiveClinic auth
- MODULE_ORDER omission → ActiveClinic SQL never applied
- Shared physical DB with wrong `environment_code` / identity_key ops discipline
- Checksum drift if existing migrations are edited (must be **additive** only)

---

## 11. Regression risks

- BlessBoard `.com` / `.org` profile resolution and cookie names
- CSRF cookie rename breaking BlessBoard forms if not aliased carefully
- Refactoring `v5FoundationServer` breaking church route mount order
- Platform-admin queries leaking ActiveClinic orgs into BlessBoard-only UIs (or reverse)
- Entitlement / plan catalogue assumptions
- Startup gates that key off BlessBoard domain strings only

---

## 12. Recommended prompt sequence

| Prompt | Focus | Notes from this audit |
|--------|-------|------------------------|
| **AC-V6-01** | Audit | This document — **PARTIAL** (no V6 branch) |
| **Pre-req** | Create `V6` from `V5` | Required before AC-V6-02 |
| **AC-V6-02** | Product registry + `activeclinic-org-v6` profile | Parameterize CSRF; do not change BlessBoard profiles |
| **AC-V6-03** | Product isolation | Prefer existing `organization_products`; seed `activeclinic` product; extend application_code |
| **AC-V6-04** | Healthcare org + facilities schema | New `activeclinic` module; no clinical PHI |
| **AC-V6-05** | Auth + context | **Decide user identity model**; isolate cookies; no BlessBoard role inference |
| **AC-V6-06** | RBAC | New ActiveClinic permissions/roles; facility scope |
| **AC-V6-07** | Minimal shell | `/login`, `/app`, facilities list — no clinical modules |
| **AC-V6-08** | Platform admin visibility | Infrastructure only; no clinical support impersonation |
| **AC-V6-09** | Hostinger readiness docs | No deploy |
| **AC-V6-10** | Full regression review | Confirm coexistence |

---

## Area-by-area audit (requested checklist)

| Area | Finding | Class |
|------|---------|-------|
| Server startup | Profile-gated V5 vs legacy; fail-closed unknown codes | A/B |
| Authentication | BlessBoard authenticate + auth transfers; apex login in foundation server | B |
| Users / identities | `blessboard.users` (+ phone columns); not platform-global | F/B |
| Sessions / cookies | Profile session names; host-only; DB `deployment_sessions` | A/B |
| CSRF | Signed double-submit; **hard-coded cookie name** | A/F |
| Organizations / tenancy | Platform orgs + product enrolment | A |
| Memberships | BlessBoard user_roles / role_assignments / members | C/B |
| Branches / OUs | `blessboard.branches` — not reusable as facilities | C |
| Permissions / roles | Central-ish engine in BlessBoard schema | B |
| Invitations | BlessBoard staff invites + action tokens | B |
| Audit logging | `platform.audit_events` + BlessBoard wrappers | A/B |
| Deployment profiles | BlessBoard-only registry | B/C → E for AC |
| Domain resolution | Platform hostname resolver | A |
| Subscriptions | Platform plans/subscriptions; BlessBoard plan seeds | A/B |
| Notifications | BlessBoard messaging | B/C |
| File storage | Media storage adapters under BlessBoard | B |
| Platform administration | Platform admin routes on V5 server | B |
| Support mode | V5 support contexts (non-impersonating) | A/B |
| Navigation / layouts | BlessBoard V5 EJS shells | C |
| Error handling | `v5SafeLogging` / controlled error pages | A/B |

---

## Final verdict

```
ACTIVECLINIC_V6_AUDIT_PARTIAL
```

**Why not COMPLETE:** Git constraint “work only on branch V6” cannot be satisfied — **`V6` does not exist**; audit was performed against **`V5` @ `ba1c1e95`**. Dirty working tree also needs a clean strategy before foundation commits.

**Why not BLOCKED:** Architecture, shared DB model, deployment patterns, and coupling risks are sufficiently understood to proceed once `V6` is created. Existing `platform.organization_products` strongly supports shared-DB multi-product isolation for AC-V6-03.

**Immediate next actions (human / AC-V6-02 prep):**

1. Create local branch `V6` from agreed tip of `V5` (do not touch `main` / `V4` / Hostinger).
2. Decide how to handle uncommitted Stitch isolation docs (keep on V6).
3. Proceed to **AC-V6-02** (product registry + `activeclinic-org-v6` profile + CSRF parameterization).
