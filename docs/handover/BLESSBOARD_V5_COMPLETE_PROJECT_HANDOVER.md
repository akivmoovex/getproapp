# BlessBoard V5 — Complete project handover

**Prepared:** 2026-07-19 (evening)  
**Branch:** `V5` (tracks `origin/V5`)  
**HEAD:** `d95dab1` — *New screens implementation*  
**Release ID (proposed, not tagged):** `blessboard-v5.0.0-rc.1`  
**This document does not authorize** Hostinger env changes, routing flips, hosted migrate apply, tags, or production cutover.

**Companions:** [`V5_FINAL_RELEASE_APPROVAL.md`](../release/V5_FINAL_RELEASE_APPROVAL.md) · [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) · [`V5_PRODUCTION_CUTOVER_MASTER_RUNBOOK.md`](../deployment/V5_PRODUCTION_CUTOVER_MASTER_RUNBOOK.md) · overnight / morning briefs in this folder

---

## Snapshot (verification at handover write)

| Item | Result |
|------|--------|
| Working tree | **Dirty** — ~111 short-status paths (~67 modified, ~44 untracked) |
| `git diff --check` | Trailing whitespace warnings in `docs/deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md` (exit reported 0 with warnings printed) |
| Fast regression | **PASS** — `npm run test:blessboard:v5:regression:fast` → **182** tests / **0** fail (~1s) |
| Full regression | **FAIL (fail-fast)** — `Auth HTTP`: subtest *user create CLI hashes password and does not print it* — `Cannot read properties of undefined (reading 'password_hash')` in `tests/blessboard-auth-http.test.js` (working-tree CLI changes likely). Remaining suites **not run** |
| Highest remaining blocker | **B01** live shadow evidence (gates authoritative); or **B02–B04** for demo E2E — see §23 |
| Recommended next supervised action | See §30 |

---

## 1. Product overview

BlessBoard V5 is a **multi-tenant church platform** on a clean Postgres foundation (`platform` + `blessboard` schemas), served from **blessboard.org** apex marketing and **hostname-resolved** tenant sites. Public packages: **Foundation**, **Growth**, **Network** (commercial vocabulary). Runtime plan keys still include legacy `free` / `professional` / `partner` until plan-key cutover.

**Pilot demo host (catalogue READY):** `diagnostic.blessboard.org` → org/church `diagnostic-church`, HQ `hq`, deployment `blessboard-org-v5`, DB identity `blessboard-platform-v5`.

**Posture today:** Local foundation strong; hosted catalogue ready for **shadow**; **authoritative pilot and production cutover NO-GO**.

---

## 2. Foundation package

| Capability | Behavior |
|------------|----------|
| Price | USD 0 |
| Branches | Soft **max 1 active** branch (HQ occupies the slot) |
| Members / admins | Soft caps (~250 members / ~10 staff — catalogue) |
| Features | Core public CMS, member portal, HQ/BA ops modules, basic reports |
| Denied | Growth advanced reports; Network custom domain / API / webhooks / etc. |

**Readiness:** READY WITH MANUAL CHECK (local entitlements green; hosted personas missing).  
Detail: [`FOUNDATION_FINAL_READINESS.md`](../release/FOUNDATION_FINAL_READINESS.md) · three-package regression.

---

## 3. Growth package

| Capability | Behavior |
|------------|----------|
| Price | USD 14.99 / active branch / month (cents SoT 1499) |
| Branches | Unlimited (`max_branches` null) |
| Features | Cross-branch HQ ops; `advanced_reports` (attendance/giving) |
| Denied | Network-only flags (`custom_domain`, API, webhooks, …) |
| Deferred catalogue | Schedulers, surveys, appointments, volunteers, offline — do not sell as live |

**Readiness:** READY WITH MANUAL CHECK.  
Detail: [`GROWTH_FINAL_READINESS.md`](../release/GROWTH_FINAL_READINESS.md).

---

## 4. Network package

| Capability | Behavior |
|------------|----------|
| Price | USD 29.99 / active branch / month (cents SoT 2999) |
| Inherits | Growth (unlimited branches + advanced reports) |
| Implemented | `custom_domain` (assisted registry + entitlement); executive dashboard (`executive_reports`); governance audit (`advanced_audit`); fixed HQ roles |
| Not live | Mailboxes, public API, webhooks, integrations, advanced custom roles, report templates, DNS/TLS automation, registrar purchase, SLA portal |

**Readiness:** READY WITH MANUAL CHECK for **implemented** scope only.  
Detail: [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md).

---

## 5. Domain architecture

- **Apex:** `blessboard.org` / `www` — marketing, login, platform admin, directory.
- **Canonical tenant:** `{slug}.blessboard.org` (demo: `diagnostic.blessboard.org`).
- **Custom / alias:** `platform.domains` types; resolve like canonical when active; **CMS HTML** still requires `authoritative` + allow-list membership.
- **Deployment binding:** Domain → `PLATFORM_DEPLOYMENT_CODE` (`blessboard-org-v5`); mismatch → fail-closed foundation HTML.
- **No** parent-domain session cookie (`Domain=.blessboard.org` forbidden).

---

## 6. Database schemas

| Schema | Role |
|--------|------|
| `platform` | Deployments, orgs, enrolments, domains, plans/features/subscriptions, identity, deployment sessions, schema_migrations, audit |
| `blessboard` | Churches, branches, users/roles, members, CMS, ops modules, media metadata |
| `getpro` / `ngo` | Empty reserved shells |
| **Forbidden on V5** | `public.tenants`, `public.session` |

Migrations: `db/migrations/platform/**`, `db/migrations/blessboard/**` — checksum-locked. Identity: `platform.database_identity` vs `DATABASE_IDENTITY_EXPECTED`.

---

## 7. Identity relationships

```text
platform.organizations
  → product_enrolments (blessboard)
    → blessboard.churches
      → branches (hq + campuses; one primary)
  → platform.domains (hostname → org + deployment)
  → organization_subscriptions → plans / plan_features

blessboard.users + user_roles (platform_admin | church_hq_admin | branch_admin)
blessboard.members + memberships (org/branch scoped)
```

**Distinct keys:** DB identity `blessboard-platform-v5` ≠ deployment code `blessboard-org-v5`.

---

## 8. Authentication / session architecture

- Apex `/login`, `/logout`, `/account`.
- Tenant `/login` → apex transfer (`tr` / one-time token) → `/auth/callback` → portal.
- Sessions: `platform.deployment_sessions`; host-only cookie (default name `blessboard_org_v5_sid`).
- CSRF: double-submit (cookie intentionally not HttpOnly).
- `SESSION_SECRET` ≥32 in production; never log tokens/cookies.

---

## 9. Authorization model

| Role | Scope |
|------|-------|
| `platform_admin` | Platform-wide PA surfaces |
| `church_hq_admin` | Org / church HQ |
| `branch_admin` | Assigned branch |
| Member | Membership-gated member portal |

Fail-closed inactive org/enrolment/church/branch. Entitlement soft/hard gates on package features. Matrix covered by `test:blessboard:authorization` (local).

---

## 10. Tenant routing modes

| Mode | Behavior |
|------|----------|
| `off` (default) | Foundation HTML on tenant hosts |
| `shadow` | Observational logs; still foundation HTML |
| `authoritative` | Tenant CMS when deployment match **and** host on `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` (empty → fail-closed) |

**Never** inferred from `NODE_ENV`, hostname, or Git branch.  
Shadow catalogue **GO to enable**; live evidence **MISSING** (B01). Authoritative **NOT READY**.

---

## 11. Implemented screens (summary)

| Area | Examples |
|------|----------|
| Apex | Home, features, pricing, FAQ, directory, for-churches, register-church enquiry, login/account |
| Tenant public | Published CMS pages (home, about, ministries, events, sermons, contact, giving, …) under authoritative |
| Member | Dashboard, profile, announcements, events, ministries, resources, forms, requests, giving info |
| Branch admin | Dashboard + module shells (content/ops as wired) |
| HQ | Dashboard, members, content, announcements, forms/requests, attendance, giving, reports, Network executive + governance audit when entitled |
| Platform admin | Orgs, domains, assignments, entitlements views as implemented |
| Media | Upload (kill-switch gated), list, soft-archive, picker |
| Ops chrome | Write-maintenance 503 page when flag on |

Parity gaps vs Stitch: see GUI audits (account/settings detail pairs, etc.).

---

## 12. Deferred screens / features

- `/member/prayer` dedicated route; waiting-verification / forgot-password flows  
- Branch: departments, duty roster, some report Stitch screens  
- HQ: monthly report review UI, custom roles UI, org templates  
- PA: billing checkout, DNS/SSL verify UI, deploy/restart/rollback UIs  
- Network brochure: mailboxes, API, webhooks, integrations, advanced roles, report templates  

---

## 13. External-service features

| Feature | Status |
|---------|--------|
| Hosted mailboxes | Requires external provider — not live |
| Public API / webhooks / integrations | Not shipped |
| DNS/TLS automation / ACME | Assisted manual only |
| Registrar purchase | External |
| Payment processors | Not in V5 foundation |
| Support SLA portal | Ops arrangement |

---

## 14. Entitlement model

- Resolver: `entitlementService` + `platform.plan_features` / subscriptions.  
- Inactive plan → fail-closed empty features.  
- Soft limits (members/branches) vs hard Network flags.  
- Nav/routes gate on entitlement keys (`custom_domain`, `executive_reports`, `advanced_audit`, `advanced_reports`, …).  
- Tests: `npm run test:platform:entitlements`.

---

## 15. Plan-key compatibility

| Persisted today | Public package |
|-----------------|----------------|
| `free` | Foundation |
| `growth` | Growth |
| `professional` | Network |
| `partner` | Legacy inactive; disposition gated |

`plan_key` **immutable** — rename = insert + repoint FKs. Plan-key migration plan: **NOT READY TO IMPLEMENT**. Provision still defaults `planKey: "free"`. V4→V5 `mapPlanKey` still emits legacy keys.  
See [`BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`](../migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md).

---

## 16. Migration tooling

| Command | Role |
|---------|------|
| `npm run migrate:v4-to-v5:plan` | Plan JSON |
| `npm run migrate:v4-to-v5:dry-run` | No target writes |
| `npm run migrate:v4-to-v5:apply -- --confirm` | **Supervised only** |
| `npm run migrate:v4-to-v5:verify` | Reconcile |
| `npm run migrate:v4-to-v5:rehearsal` | Local fixtures — **PASS** historically |

**Env:** explicit `V4_SOURCE_DATABASE_URL` + `V5_TARGET_DATABASE_URL` only — no `DATABASE_URL` migrator fallback; no `GETPRO_DATABASE_URL`.  
**Hosted dry-run/apply:** still **pending** (B06).

---

## 17. Demo provisioning

- Catalogue for `diagnostic-church` **READY**; users/CMS/samples **MISSING** (B02–B04).  
- Approved path: platform/church provision CLIs + user create/role assign + demo dataset tool (`db/scripts/demo-v5-dataset.js` / `demoMinimumDatasetService`) — see demo dataset docs.  
- **Never** `church:seed-demos` / V4 seeds on V5.  
- Supervised launch: [`V5_SUPERVISED_DEMO_LAUNCH_RUNBOOK.md`](../deployment/V5_SUPERVISED_DEMO_LAUNCH_RUNBOOK.md) — execute E2E **NO** until blockers close.

---

## 18. Test commands

```bash
# Fast gate (static + audits + routing mode) — PASS at handover
npm run test:blessboard:v5:regression:fast

# Full V5 regression (fail-fast) — FAILED Auth HTTP at handover
npm run test:blessboard:v5:regression

# Useful subsets
npm run test:platform:entitlements
npm run test:blessboard:authorization
npm run test:blessboard:tenant-routing
npm run test:blessboard:write-maintenance
npm run test:blessboard:kill-switches
npm run test:blessboard:a11y-structure

# Deployed smoke (allowlisted testing hosts only — do not point at prod casually)
npm run smoke:v5:deployed

# Local migration rehearsal (fixture DBs)
npm run migrate:v4-to-v5:rehearsal
```

---

## 19. Environment variables (V5 Hostinger essentials)

| Variable | Expected |
|----------|----------|
| `PLATFORM_DEPLOYMENT_CODE` | `blessboard-org-v5` |
| `DEPLOYMENT_ENV` | `testing` until promote approved |
| `DATABASE_URL` | V5 project only |
| `DATABASE_IDENTITY_EXPECTED` | e.g. `blessboard-platform-v5` |
| `GETPRO_DATABASE_URL` | **Unset** |
| `BLESSBOARD_TENANT_ROUTING_MODE` | `off` (or supervised `shadow`) |
| `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` | Empty until signed pilot hosts |
| `BLESSBOARD_JOBS_ENABLED` | `0` |
| `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | unset/`0` unless signed |
| `BLESSBOARD_WRITE_MAINTENANCE` | unset/`0` except migrate freeze |
| `SESSION_SECRET` | ≥32 chars |
| `BASE_DOMAIN` | `blessboard.org` (prod) |

Full table: [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md).

---

## 20. Deployment sequence (high level)

1. V5 schema + identity + seeds on target DB  
2. Deploy app package; verify `/healthz`; routing **`off`**; jobs/uploads off  
3. Demo provision (parallel track)  
4. Plan-key when READY (before or carefully after V4 apply — see combined order)  
5. Hosted V4→V5 dry-run → conflict approval → apply → reconcile → idempotency  
6. Shadow enable + evidence pack  
7. Supervised authoritative pilot (allow-list) + smoke  
8. Monitoring / post-cutover validation  
9. Estate cutover only after master runbook stages + Leadership GO  

Order SoT: [`V5_COMBINED_MIGRATION_ORDER_RUNBOOK.md`](../migrations/V5_COMBINED_MIGRATION_ORDER_RUNBOOK.md) · [`V5_PRODUCTION_CUTOVER_MASTER_RUNBOOK.md`](../deployment/V5_PRODUCTION_CUTOVER_MASTER_RUNBOOK.md).

---

## 21. Monitoring and incident response

- Requirements: [`V5_MONITORING_REQUIREMENTS.md`](../operations/V5_MONITORING_REQUIREMENTS.md) — rate thresholds **BASELINE REQUIRED** until quiet window measured.  
- Incidents: [`V5_INCIDENT_RESPONSE.md`](../operations/V5_INCIDENT_RESPONSE.md) — cross-tenant always CRITICAL.  
- Post-cutover windows: [`V5_POST_CUTOVER_VALIDATION.md`](../deployment/V5_POST_CUTOVER_VALIDATION.md).  
- Manual Hostinger log tail is valid until external APM approved.

---

## 22. Backup and rollback

- Backups: [`V5_BACKUP_RECOVERY_REQUIREMENTS.md`](../operations/V5_BACKUP_RECOVERY_REQUIREMENTS.md) — hosted evidence often **UNKNOWN** until ticket IDs.  
- Routing rollback: mode → `shadow`/`off`; clear allow-list; restart **all** workers.  
- Migrate rollback: restore V5 from pre-apply snapshot; **no** V5→V4 reverse-write.  
- App package: redeploy last known-good.  
- Cutover decision clock: ≤4h after authoritative for major demote (ops docs).

---

## 23. Known blockers (CRITICAL / HIGH)

| ID | Summary | Blocks |
|----|---------|--------|
| **B01** | Live shadow evidence pack missing | Authoritative |
| **B02–B04** | Demo personas / Home+About / samples missing | Demo E2E |
| **B05** | Hosted authoritative smoke not run | Authoritative pilot |
| **B06–B08** | Hosted migrate + mapping + media blobs | Production cutover |
| **B09** | Authoritative approval unsigned | Authoritative |
| **B10** | Estate cutover gates open | Production |
| **B12** | Plan-key not READY | Vocabulary cutover |
| Working tree | Dirty + full regression fail-fast | Formal RC cut |

Full table: [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) · approval packet [`V5_FINAL_RELEASE_APPROVAL.md`](../release/V5_FINAL_RELEASE_APPROVAL.md) → **NO-GO** production.

---

## 24. Next development priorities

1. **Stabilize working tree** — fix Auth HTTP / user-create CLI regression; commit docs+hardening in reviewed chunks (when asked).  
2. **Provision demo personas + minimum CMS/samples** on hosted V5 (never `church:seed-demos`).  
3. **Execute shadow runbook** — capture B01 evidence pack.  
4. **Supervised demo launch** after B01–B04 + Leadership.  
5. **Hosted V4→V5 dry-run** rehearsal (identity + backups first).  
6. Close plan-key product gates; then implement insert+repoint.  
7. Media blob strategy for cutover.  
8. Network external services only under explicit product epics.

---

## 25. Prohibited unsafe actions

- Unsupervised `migrate:v4-to-v5:apply`  
- Set `authoritative` without pilot evidence + signed approval  
- Global authoritative without allow-list / estate sign-off  
- Set `GETPRO_DATABASE_URL` on V5  
- Create `public.session` / `public.tenants` on V5  
- Parent-domain session cookies  
- Infer routing from `NODE_ENV` / Git / hostname  
- `church:seed-demos` on V5 foundation DB  
- Share secrets/URLs/PII in chat, tickets, or git  
- Destructive cleanup before reconciliation  
- CI auto-flip routing or auto-apply hosted migration  
- In-place `UPDATE plan_key`  
- Disable CSRF / identity / throttling “to unblock”

---

## 26. Key documentation index

| Topic | Path |
|-------|------|
| Release blockers | `docs/release/V5_RELEASE_BLOCKERS.md` |
| Final approval packet | `docs/release/V5_FINAL_RELEASE_APPROVAL.md` |
| Versioning / changelog | `docs/release/V5_RELEASE_VERSIONING.md` · `CHANGELOG_V5.md` |
| RC checklist | `docs/release/V5_RELEASE_CANDIDATE_CHECKLIST.md` |
| Three-package regression | `docs/release/THREE_PACKAGE_REGRESSION_REPORT.md` |
| Cutover master | `docs/deployment/V5_PRODUCTION_CUTOVER_MASTER_RUNBOOK.md` |
| Post-cutover validation | `docs/deployment/V5_POST_CUTOVER_VALIDATION.md` |
| Shadow / authoritative | `docs/deployment/V5_SHADOW_*` · `V5_AUTHORITATIVE_*` |
| Env reference | `docs/deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md` |
| Combined migration order | `docs/migrations/V5_COMBINED_MIGRATION_ORDER_RUNBOOK.md` |
| Plan-key | `docs/migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md` |
| Hosted cutover | `docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md` |
| Demo readiness / launch | `docs/testing/V5_DEMO_*` · `V5_SUPERVISED_DEMO_LAUNCH_RUNBOOK.md` |
| Monitoring / incident / backup | `docs/operations/V5_*` |
| Security / a11y / GUI | `docs/security/V5_*` · `docs/gui/V5_*` |
| Prior handovers | `docs/handover/BLESSBOARD_V5_OVERNIGHT_HANDOVER.md` · morning brief · Network / FG handovers |

---

## 27. Morning verification commands

```bash
cd /path/to/getpro
git fetch origin
git branch --show-current          # expect V5
git status -sb
git rev-parse --short HEAD
git diff --check | head -40

npm run test:blessboard:v5:regression:fast
# After fixing Auth HTTP / before claiming release:
npm run test:blessboard:v5:regression

# Optional identity (ops workstation — placeholders only)
# export DATABASE_URL='…' DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
# npm run db:identity:check
```

Do **not** change Hostinger env from morning checks alone.

---

## 28. Current Git status (at handover)

```
Branch: V5...origin/V5
HEAD:   d95dab1734ad3e2fe58d14afbec9b7e7426a4241 (d95dab1)
State:  Dirty — ~111 paths (modified + untracked)
```

**Themes in the dirty tree (non-exhaustive):**

- Migration tooling (`src/migration/v4ToV5/**`) + tests  
- Tenant routing / allow-list / public paths  
- Kill switches (media uploads), write-maintenance middleware + views  
- Demo dataset scripts/services + provision CLI safety  
- Deployed smoke + shadow log validator tools  
- Large docs wave: cutover master, post-cutover validation, final approval, RC/versioning, demo/ops/migration docs  
- `CHANGELOG_V5.md` untracked  
- Many portal/auth/media test fixture updates  

Exact list: run `git status --short`.

---

## 29. Recent commits

```
d95dab1 New screens implementation   ← HEAD
fa36fea New screens implementation
de660d3 New screens implementation
e778961 New screens implementation
a1503ab New screens implementation
9efb92d New screens implementation
7ee6e5f New screens implementation
083424e New screens implementation
8286ad1 New screens implementation
5e6b9ff New screens implementation
d29d6a7 New screens implementation
60bfc05 New screens implementation
```

Messages are non-unique — **always cite SHA** in tickets. Hardening/docs after these commits are largely **uncommitted**.

---

## 30. Recommended next supervised action

**Do this next (single supervised track):**

1. **Fix full regression** — restore Auth HTTP / `blessboard-user-create` CLI contract so `password_hash` assertion passes; re-run `npm run test:blessboard:v5:regression` to green.  
2. **Commit** (only when Leadership asks) in logical slices: docs packet → kill-switches/maintenance → migration tooling → demo tooling.  
3. **Then ops:** provision hosted demo personas + Home/About (B02–B03) **or** execute **shadow runbook** evidence (B01) if demo data waits — both are CRITICAL, pick by owner availability.  
4. **Do not** enable authoritative or hosted migrate apply.

**Highest remaining blocker for product demo:** **B02–B04** (no personas/CMS).  
**Highest remaining blocker for routing promotion:** **B01** (no live shadow evidence).

---

## Suggested commit message (when asked to commit)

```
docs(handover): add complete BlessBoard V5 project handover

Capture architecture, packages, ops/runbooks, blockers, and
verification snapshot (fast PASS; full Auth HTTP fail-fast) without
authorizing routing flips or hosted migrate apply.
```

(If bundling code+docs later, split commits; do not invent a single mega-commit without review.)

---

## Document control

| Field | Value |
|-------|--------|
| Created | 2026-07-19 |
| Application code modified by this task | **No** |
| Stop | End of Prompt 86 — no further work |
