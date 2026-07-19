# Foundation & Growth — backend-blocked screen implementation plan

**Date:** 2026-07-19  
**Mode:** Planning only — no migrations, routes, services, or GUI code  
**Sources:** [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](./FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`GROWTH_PLAN_PARITY_AUDIT.md`](../gui/GROWTH_PLAN_PARITY_AUDIT.md) · [`V4_TO_V5_DATA_MAPPING.md`](../database/V4_TO_V5_DATA_MAPPING.md) · V5 schema through `blessboard/025` + `platform/013` · `blessBoardPackageCatalogue.js` · `entitlementService.js` · fixed `user_roles.role_key` check

**Rules applied:** Do not invent product requirements. Catalogue aspirational flags ≠ approved package obligations. Network capabilities stay Network. V4 `public.church_*` is evidence of legacy shape only, not a V5 build mandate.

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **REQUIRED FOR FOUNDATION** | Needed for Foundation commercial honesty (capacity / approved package table) or Foundation ops that have no approved workaround |
| **REQUIRED FOR GROWTH** | Needed for Growth commercial honesty beyond what already ships (cross-branch HQ + `advanced_reports`) |
| **OPTIONAL BACKLOG** | Stitch and/or catalogue signal exists; safe to defer; not required to sell Foundation/Growth as currently demoed |
| **NETWORK-ONLY** | Owned by Network package / assisted onboarding per pricing SoT |
| **REMOVE FROM PRODUCT SCOPE** | Explicitly out of Foundation/Growth V5 product (do not fund backend) |

---

## Architecture snapshot (current)

| Layer | State relevant to blocked screens |
|-------|-----------------------------------|
| Roles | Fixed `platform_admin` / `church_hq_admin` / `branch_admin` only (`blessboard.user_roles`) — **no** leader / custom matrix |
| Member care | `member_requests` with categories `prayer` \| `pastoral` \| `practical` \| `other` — **no** dedicated prayer table |
| Reporting | HQ aggregate hub + attendance/giving detail; `basic_reports` / `advanced_reports` via `entitlementService` |
| Capacity | `assertCanCreateBranch` exists; **not** wired into all provision / branch-create paths |
| Scheduler / jobs | No V5 blessboard announcement scheduler, report export queue, or offline attendance sync |
| Departments / duty / monthly reports | Present in V4; **unsupported** in V5 schema (mapping Phase 2 / unsupported) |
| Catalogue | Growth flags surveys, appointments, volunteers, offline attendance, scheduled broadcasts/reports, advanced care — **DEFERRED** in coverage (not live Growth GUI) |

---

## Master classification (every backend-blocked / deferred item)

| ID | Feature | Class | Evidence (short) |
|----|---------|-------|------------------|
| B1 | Waiting verification (pending-member session) | **OPTIONAL BACKLOG** | Stitch pair; `/register/submitted` ships; no approved V5 pending-session auth design |
| B2 | Dedicated member prayer request route | **OPTIONAL BACKLOG** | Requests already support `category=prayer`; FG-Q07 can close via link-or-hide without new schema |
| B3 | Departments directory | **OPTIONAL BACKLOG** | Stitch + V4 tables; intentional BA omission; not in pricing comparison |
| B4 | Duty roster | **OPTIONAL BACKLOG** | Same as B3; mapping Phase 2 unsupported |
| B5 | Branch monthly reports (submit / history / detail) | **OPTIONAL BACKLOG** | V4 workflow not ported; Foundation **basic** reporting already via HQ hub (`basic_reports`) |
| B6 | HQ monthly reports review (+ detail) | **OPTIONAL BACKLOG** | Depends on B5; not required for Growth `advanced_reports` (attendance/giving already gated) |
| B7 | HQ permission / role management UI | **OPTIONAL BACKLOG** *(assignment of fixed roles)* | Fixed three roles exist; no assignment UI. **Custom / advanced roles** → see N2 |
| B8 | HQ organization templates / standards | **OPTIONAL BACKLOG** | HQ content CMS exists; no template applicator; not in pricing SoT |
| B9 | `max_branches` hard enforcement on create/provision | **REQUIRED FOR FOUNDATION** | Pricing + plan capacity SoT (`max_branches = 1`); assert exists, wiring incomplete |
| D1 | Forgot password | **OPTIONAL BACKLOG** | Product undecided; apex login intentionally omits link |
| D2 | Scheduled broadcasts / communications | **OPTIONAL BACKLOG** | Catalogue Growth; publish-now only; Growth demo excludes as DEFERRED |
| D3 | Scheduled reports | **OPTIONAL BACKLOG** | Catalogue Growth; no job queue; DEFERRED in Growth parity audit |
| D4 | Offline attendance | **OPTIONAL BACKLOG** | Catalogue Growth; no sync protocol; DEFERRED |
| D5 | Surveys | **OPTIONAL BACKLOG** | Catalogue; no schema/routes; DEFERRED |
| D6 | Appointments calendar | **OPTIONAL BACKLOG** | Catalogue; no schema/routes; DEFERRED |
| D7 | Volunteer scheduling | **OPTIONAL BACKLOG** | Catalogue; no schema/routes; DEFERRED |
| D8 | Advanced pastoral-care workflows | **OPTIONAL BACKLOG** | Beyond request categories; no care engine; DEFERRED |
| X1 | Leader portal | **REMOVE FROM PRODUCT SCOPE** | No V5 leader role; coverage `NOT_IN_SCOPE` |
| N1 | Custom domain / hosted mailboxes / API / webhooks | **NETWORK-ONLY** | Pricing SoT |
| X2 | Banking / QR giving settings | **REMOVE FROM PRODUCT SCOPE** | Intentionally omitted |
| N2 | Advanced / custom role matrix beyond fixed three | **NETWORK-ONLY** | Pricing: Network “fair use + advanced roles”; Growth uses fixed roles + fair-use seats |

**Not classified as MISSING_BACKEND (do not queue as schema programs here):** Create-organization **GUI** (FG-Q06) — CLI provision backend exists; blocked by product unlock, not missing tables.

---

## Retained features — implementation matrix

Only rows that may still be funded. Removed/Network rows are listed in summary §4–§5 without slice plans.

Priority: `P0` = required package honesty · `P1` = product-decision unlock · `P2` = optional Stitch/catalogue · `P3` = large deferred domains.

| Priority | Package | Feature | Stitch screens | Schema needed | Service needed | Routes needed | Roles | Entitlement | Migration risk | Batch order |
|----------|---------|---------|----------------|---------------|----------------|---------------|-------|-------------|----------------|-------------|
| P0 | Foundation (+ Growth honesty) | Hard `max_branches` on provision / branch create | — (ops; not a Stitch screen) | None (use `platform.plans` / entitlements) | Wire `assertCanCreateBranch` into all create/provision paths; fail closed | Existing provision CLI + any future branch-create UI | `platform_admin` (provision); HQ if branch-create UI | `max_branches` | **Low** — no DDL; fixture/tests may assume soft create | **1** |
| P1 | Foundation | Member prayer CTA resolution | `57edf489…` / `1dd180a3…` (only if dedicated route chosen) | **None** if link to requests; dedicated route still no new table if thin alias | Optional thin controller reusing `formsRequestsService` | Optional `GET/POST /member/prayer-request` **or** dashboard link to `/member/requests/new?category=prayer` | `member` | all packages | **Low** | **2** (after FG-Q07 decision) |
| P1 | Foundation | Waiting verification session | `239beae5…` / `8e6e504f…` | Pending-member session or registration-status session model (design TBD) | Auth + registration status service | Undecided waiting route | pending member (new) | all | **High** — auth surface | **3** (only after auth product design) |
| P1 | Foundation | Forgot password | `61a6861b…` / `f4bb9457…` | Reset token store (+ mailer product) | Token issue/consume + mailer | Reset request/confirm routes | anon → member/admin | all | **High** — security | **4** (only after product decision) |
| P2 | Foundation | Departments directory | `7ee4d401…` / `3794bd0c…` | New `blessboard` department tables (church/branch scoped) | CRUD + list/filter service | `/branch-admin/departments*` (HQ optional later) | `branch_admin`, `church_hq_admin` | all (unless product gates later) | **Medium** — new domain; V4 map optional | **5** |
| P2 | Foundation | Duty roster | `37bdc9ea…` / `51d3e5bf…` | New roster / assignment tables | Roster CRUD + date-range queries | `/branch-admin/duty-roster*` | `branch_admin`, `church_hq_admin` | all (unless gated) | **Medium** | **6** (prefer after departments if shared org units) |
| P2 | Foundation | Branch monthly reports | `d7bdddc0…` / `45a88626…` / `5b6ec354…` / `48955e5a…` (+ mobiles) | Monthly-report header + line/status tables **or** explicit product decision to keep aggregates-only | Submit / history / detail + status transitions | `/branch-admin/reports*` | `branch_admin` | `basic_reports` (if retained as BA workflow) | **High** — V4 port ambiguity; duplicates attendance/giving | **7** |
| P2 | Growth | HQ monthly report review | `44040073…` / `b53425f3…`; detail `aa7cdf0f…` / `d03fc656…` | Same as B5 + review fields | Approve/reject / cross-branch queue | `/hq/reports/monthly*` (names TBD) | `church_hq_admin` | Growth+ if product ties to advanced ops | **High** — depends on batch 7 | **8** |
| P2 | Growth | HQ fixed-role assignment UI | `12f5be53…` / `de3e82ef…` | None if assigning existing `user_roles` only | Role assign/revoke + seat quota checks | `/hq/roles*` or settings sub-routes | `church_hq_admin`, `platform_admin` | `max_staff_accounts` / admins.max | **Medium** — authz mistakes | **9** |
| P2 | Growth | HQ org templates / standards | `df111bee…` / `801584ed…` | Template definitions + apply audit | Template CRUD + applicator onto CMS entities | `/hq/templates*` | `church_hq_admin` | Growth+ if claimed | **High** — content overwrite risk | **10** |
| P3 | Growth | Scheduled broadcasts | Broadcast Stitch chrome | Schedule columns + job/outbox tables | Scheduler worker + publish-at | Extend announcements admin | HQ/BA | `broadcasts.scheduled` | **High** — jobs/ops | **11** |
| P3 | Growth | Scheduled reports | — | Job queue + export artifacts | Report scheduler + delivery | HQ reports schedule UI | `church_hq_admin` | `reports.scheduled` / `scheduled_monthly` | **High** | **12** |
| P3 | Growth | Offline attendance | — | Sync queue + device/idempotency | Offline ingest + conflict policy | BA attendance sync API + client protocol | `branch_admin` | `attendance.offline` | **High** | **13** |
| P3 | Growth | Surveys | — | Survey + response schema | Survey admin + member submit | BA/HQ + member routes | BA/HQ/member | `surveys.custom` | **High** | **14** |
| P3 | Growth | Appointments | — | Calendar / slot / booking tables | Booking + availability | Member + admin calendar routes | member/BA/HQ | `appointments.calendar` | **High** | **15** |
| P3 | Growth | Volunteer scheduling | — | Shift / signup tables | Scheduling service | BA/HQ volunteer routes | BA/HQ/member | `volunteers.scheduling` | **High** | **16** |
| P3 | Growth | Advanced pastoral-care workflows | — | Case/workflow engine beyond `member_requests` | Care automation service | Care admin routes | BA/HQ | `care.automation=advanced` | **High** | **17** |

---

## Vertical slice template (every funded batch)

Each implementation batch = **one feature** only. Execute layers in order; do not skip entitlement/tests for schema-only merges.

1. **Schema / migration** — `blessboard` or `platform` DDL only as required; no `public` app tables  
2. **Repository / service** — church/branch UUID scope; no legacy `public.church_*` runtime  
3. **Authorization / entitlement** — existing role gates + catalogue/`entitlementService` keys where product already defined  
4. **Route / controller** — CSRF, host-only session, fail-closed  
5. **Desktop / mobile Stitch GUI** — only after backend contract stable; exact Stitch IDs from coverage  
6. **Tests** — focused `npm run test:blessboard:*` / platform entitlement suites  
7. **Documentation** — batch note + coverage/blocked-screens status refresh  

---

## Proposed batches (one feature each)

| Batch | Feature | Class | Notes |
|------:|---------|-------|-------|
| BB-01 | `max_branches` provision wiring | REQUIRED FOR FOUNDATION | No Stitch; highest honesty ROI; no unrelated features |
| BB-02 | Prayer CTA (link **or** thin dedicated route) | OPTIONAL / P1 | Starts only after FG-Q07 product decision |
| BB-03 | Waiting verification | OPTIONAL / P1 | Starts only after auth product design |
| BB-04 | Forgot password | OPTIONAL / P1 | Starts only after mailer + security product decision |
| BB-05 | Departments | OPTIONAL BACKLOG | New domain; do not bundle duty roster |
| BB-06 | Duty roster | OPTIONAL BACKLOG | Separate batch even if departments land first |
| BB-07 | Branch monthly reports | OPTIONAL BACKLOG | Do not start until product confirms aggregates-only is insufficient |
| BB-08 | HQ monthly report review | OPTIONAL BACKLOG | Depends on BB-07 only |
| BB-09 | HQ fixed-role assignment UI | OPTIONAL BACKLOG | Not custom role matrix (Network) |
| BB-10 | HQ org templates | OPTIONAL BACKLOG | Separate from CMS polish |
| BB-11…BB-17 | D2–D8 catalogue domains | OPTIONAL BACKLOG | One domain per batch; elevate to REQUIRED FOR GROWTH only after explicit product decision |

Do **not** combine unrelated features (e.g. departments + duty roster, monthly reports + scheduled reports, prayer + pastoral automation).

---

## Report

### 1. Required Foundation backend features

| Feature | Why required |
|---------|----------------|
| **Hard `max_branches` enforcement** on all branch create / provision paths | Foundation commercial SoT: max **1** active branch; soft gap documented in coverage / Growth parity audit |

No other MISSING_BACKEND / DEFERRED item is **required** for Foundation package honesty given current approved workarounds and shipped HQ **basic** reports.

### 2. Required Growth backend features

| Feature | Why |
|---------|-----|
| *(none elevated in this plan)* | Growth differentiators already shipping: unlimited branches (soft), cross-branch HQ admin, `advanced_reports` attendance + giving. Catalogue “scheduling / workflows” items are explicitly **DEFERRED** and must not be sold as live until product elevates them. |

If marketing continues to claim “Advanced workflows, scheduling, and reporting” without catalogue scrub, product must either (a) narrow public copy to shipped surfaces, or (b) elevate specific D2–D8 rows to **REQUIRED FOR GROWTH** — that elevation is a **manual product decision**, not an invention of this plan.

**Update (2026-07-19):** Option (a) applied — public matrix scrubbed. See [`COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md`](./COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md).

### 3. Optional / deferred features

- Waiting verification (B1)  
- Dedicated prayer route (B2) — or close via FG-Q07 link-or-hide without backend  
- Departments (B3), duty roster (B4)  
- Branch + HQ monthly report workflow (B5–B6)  
- HQ fixed-role assignment UI (B7), org templates (B8)  
- Forgot password (D1)  
- Scheduled broadcasts/reports, offline attendance, surveys, appointments, volunteer scheduling, advanced pastoral workflows (D2–D8)  

### 4. Network-only features

- Custom organization domain  
- Hosted mailboxes (up to 5 per active branch)  
- API / webhooks / integrations  
- Executive / custom report builder + API exports (beyond Growth advanced aggregates)  
- Advanced / custom role matrix beyond fixed V5 roles  
- Priority support & assisted onboarding processes  

### 5. Recommended first backend vertical slice

**BB-01 — Wire `assertCanCreateBranch` into every provision and branch-create path**

- Package: Foundation (also closes Growth/Network capacity honesty)  
- Schema: none  
- Service: call existing `entitlementService.assertCanCreateBranch` (or equivalent transactional check) before insert  
- Routes/CLI: all paths that create `blessboard.branches`  
- Roles: provision actors (`platform_admin` / ops CLI)  
- Entitlement: `max_branches`  
- Migration risk: low  
- Slice layers: (2) service wiring → (3) entitlement assert → (4) CLI/route call sites → (6) entitlement + provision tests → (7) docs (coverage / blocked-screens #9)  
- Explicitly **out of this batch:** create-org GUI, monthly reports, catalogue domains  

### 6. Manual product decisions required

| # | Decision | Blocks |
|---|----------|--------|
| M1 | FG-Q07: prayer dashboard CTA — **link** to `/member/requests/new?category=prayer` vs **keep disabled** vs **fund dedicated route** | BB-02 / GUI FG-Q07 |
| M2 | Is Foundation “Basic reporting” satisfied by HQ aggregate hub alone, or is V4-style **branch monthly submit/review** required? | BB-07 / BB-08 |
| M3 | Auth: pending-member **waiting verification** session — design or permanently rely on `/register/submitted` | BB-03 |
| M4 | Forgot password — in-product reset vs admin-assisted only vs omit | BB-04 |
| M5 | Which Growth catalogue scheduling/workflow claims are **sold as live** vs scrubbed from marketing until built? | **Resolved (scrub):** public marketing no longer sells D2–D8 as live — see `COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md`. Elevation of D2–D8 to REQUIRED FOR GROWTH remains a separate product decision. |
| M6 | HQ Stitch “roles” — assignment UI for **fixed three roles** only vs Network **advanced roles** program | BB-09 vs Network track |
| M7 | Org templates — fund applicator vs keep CMS-only and retire Stitch pair from Foundation/Growth scope | BB-10 |
| M8 | Departments / duty roster — retain as optional V5 domains or mark Stitch pairs obsolete for V5 | BB-05 / BB-06 |
| M9 | FG-Q06 create-organization **GUI** unlock (CLI already exists) — separate from backend-blocked schema work | Platform GUI, not BB-01 |

---

## Explicit removals (do not implement under Foundation/Growth)

| Item | Class | Action |
|------|-------|--------|
| Leader portal (all Stitch family) | REMOVE FROM PRODUCT SCOPE | Keep `NOT_IN_SCOPE`; no leader `role_key` |
| Banking / QR giving settings Stitch | REMOVE FROM PRODUCT SCOPE | Remain omitted |
| Network domain / mailbox / API as Growth work | NETWORK-ONLY | Track under Network assisted onboarding only |

---

## Stop condition

This document is the planning deliverable. **No migrations, runtime code, or GUI batches** are authorized by this file alone. Next engineering step, if approved: execute **BB-01** only.
