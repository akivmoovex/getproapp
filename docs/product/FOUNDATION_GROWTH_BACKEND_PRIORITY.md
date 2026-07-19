# Foundation & Growth — backend feature priority

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Prioritization + BB-01 shipped on `V5`  
**Sources:** [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](./FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`FOUNDATION_GROWTH_BACKEND_SCREEN_PLAN.md`](./FOUNDATION_GROWTH_BACKEND_SCREEN_PLAN.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`PRAYER_REQUEST_FEATURE_DECISION.md`](./PRAYER_REQUEST_FEATURE_DECISION.md) · [`PLATFORM_CREATE_ORGANIZATION_GUI_DECISION.md`](./PLATFORM_CREATE_ORGANIZATION_GUI_DECISION.md) · `blessBoardPackageCatalogue.js` · `entitlementService` / `003_blessboard_plans.sql` · fixed `user_roles.role_key`

**Rules:** Catalogue aspirational flags ≠ sold product. Do not invent pastoral/leader roles. Do not combine unrelated features into one slice. Network stays Network.

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **REQUIRED FOR FOUNDATION** | Needed for Foundation commercial honesty or capacity SoT with no approved workaround |
| **REQUIRED FOR GROWTH** | Needed for Growth commercial honesty beyond what already ships |
| **OPTIONAL GROWTH** | Useful Growth/HQ ops; not required to demo or sell Growth as currently shipped |
| **NETWORK-ONLY** | Pricing SoT Network / assisted onboarding |
| **DEFERRED** | Stitch or catalogue signal; no V5 schema/program until product elevates |
| **REMOVE FROM SCOPE** | Do not fund under Foundation/Growth V5 |

---

## Architecture snapshot (relevant)

| Layer | State |
|-------|--------|
| Roles | Fixed `platform_admin` / `church_hq_admin` / `branch_admin` / member — **no** leader or custom matrix |
| Care | `member_requests` categories include `prayer` — dedicated prayer table **not** required ([prayer decision](./PRAYER_REQUEST_FEATURE_DECISION.md)) |
| Reports | HQ hub + gated attendance/giving (`basic_reports` / `advanced_reports`) |
| Capacity | `max_branches` wired on create, activate, HQ provision insert, and plan downgrade ([max_branches audit](./MAX_BRANCHES_ENFORCEMENT_AUDIT.md)) |
| Create org | **CLI-only** for cutover ([create-org decision](./PLATFORM_CREATE_ORGANIZATION_GUI_DECISION.md)) — not a backend schema gap |
| Scheduler | No V5 blessboard job/outbox for broadcasts, reports, or offline sync |

---

## Priority matrix (candidate review)

| Priority | Feature | Package | Current blocker | Business value | Complexity | Risk | Recommendation |
|---------|:--------|---------|-----------------|----------------|------------|------|----------------|
| **1** | `max_branches` hard enforcement | Foundation (+ all) | **Shipped (BB-01)** | **High** — package honesty | Low | Medium (concurrency / reactivation) | **REQUIRED FOR FOUNDATION** — done |
| — | Waiting verification | Foundation | No pending-member session / auth design | Medium (Stitch) | High | **High** (auth) | **DEFERRED** until auth product design |
| — | Dedicated prayer route/table | Foundation | Product D1/D2 unsigned; category already live | Low (workaround exists) | Low–Med | Medium (HQ privacy) | **REMOVE FROM SCOPE** as dedicated schema; CTA = product gate only |
| — | Departments | Foundation Stitch | No V5 schema | Medium | Medium | Medium | **DEFERRED** |
| — | Duty roster | Foundation Stitch | No V5 schema | Medium | Medium | Medium | **DEFERRED** |
| — | Branch monthly reports | Foundation Stitch | V4 not ported; BA nav disabled | Medium | High | High (duplicates aggregates) | **DEFERRED** pending “aggregates sufficient?” decision |
| — | HQ monthly reports | Growth/Foundation | Depends on branch monthly | Medium | High | High | **DEFERRED** (depends on branch monthly) |
| **2** | HQ fixed-role assignment UI | Growth/HQ | **Shipped (BB-02)** | Medium | Medium | Medium (authz mistakes) | **OPTIONAL GROWTH** — done |
| — | HQ organization templates | Growth Stitch | No template applicator | Low–Med | High | High (content overwrite) | **DEFERRED** |
| — | Scheduled communications | Growth catalogue | No scheduler / SMS | Marketing-only today | High | High | **DEFERRED** |
| — | Scheduled reports | Growth catalogue | No job/export queue | Marketing-only today | High | High | **DEFERRED** |
| — | Offline attendance | Growth catalogue | No sync protocol | Marketing-only today | High | High | **DEFERRED** |
| — | Surveys | Growth catalogue | No schema/routes | Marketing-only today | High | High | **DEFERRED** |
| — | Appointments | Growth catalogue | No schema/routes | Marketing-only today | High | High | **DEFERRED** |
| — | Volunteer scheduling | Growth catalogue | No schema/routes | Marketing-only today | High | High | **DEFERRED** |
| — | Pastoral-care workflows (beyond requests) | Growth catalogue | No care engine | Marketing-only today | High | High | **DEFERRED** |
| — | Create-organization GUI | Platform | Product: KEEP CLI-ONLY | Low for cutover | Med–High | High (credentials) | **REMOVE FROM SCOPE** for cutover backend queue |
| — | Custom domain / mailboxes / API | Network | Assisted / Network SoT | Network | — | — | **NETWORK-ONLY** |
| — | Advanced / custom role matrix | Network | Pricing “advanced roles” | Network | High | High | **NETWORK-ONLY** |
| — | Leader portal | — | No leader role | — | — | — | **REMOVE FROM SCOPE** |
| — | Banking / QR giving settings | — | Intentionally omitted | — | — | — | **REMOVE FROM SCOPE** |

**REQUIRED FOR GROWTH (schema programs):** none. Growth honesty already covered by multi-branch HQ mounts + `advanced_reports` (attendance + giving). Catalogue “scheduling / advanced workflows” remain **DEFERRED** until marketing is scrubbed or product elevates specific rows.

---

## Retained features — vertical slices

Retained = **REQUIRED** / **OPTIONAL GROWTH** / fundable **DEFERRED** (one feature each). Layers always in this order; do not skip tests.

### Slice BB-01 — `max_branches` enforcement  
**Class:** REQUIRED FOR FOUNDATION · **Priority:** 1 · **Status:** **shipped**

| Layer | Scope |
|-------|--------|
| 1. Schema | **None** — use `platform.plan_features.max_branches` |
| 2. Service | `createBlessBoardBranch`, `activateBlessBoardBranch`, HQ provision insert gate, `assignOrganizationPlan` capacity check |
| 3. Authorization | Existing provision / HQ actors only; no new roles |
| 4. Entitlement | `max_branches` (`FEATURE_KEYS.MAX_BRANCHES`); HQ counted in active count (SoT) |
| 5. Route | Platform-admin plan assign surfaces `branch_limit` flash; no new HQ create GUI |
| 6. Stitch GUI | N/A |
| 7. Tests | `tests/platform-entitlements.test.js` (Foundation / Growth / Network / activate / concurrent / downgrade) |
| 8. Migration / deploy | No DDL; no hosted migration |

### Slice BB-02 — HQ fixed-role assignment UI  
**Class:** OPTIONAL GROWTH · **Priority:** 2 · **Status:** **shipped**

| Layer | Scope |
|-------|--------|
| 1. Schema | **None** — existing `blessboard.user_roles` |
| 2. Service | `hqRoleManagementService` assign/revoke + seat checks |
| 3. Authorization | `church_hq_admin` / `platform_admin` only — **not** Network custom matrix |
| 4. Entitlement | Soft `max_staff_accounts` |
| 5. Route | `/hq/roles` (+ assign / revoke) |
| 6. Stitch GUI | `12f5be53…` / `de3e82ef…` (fixed roles only; no leader matrix) |
| 7. Tests | `tests/blessboard-hq-roles.test.js` |
| 8. Migration / deploy | No DDL; CSRF on mutations |

### Slice BB-03 — Departments directory  
**Class:** DEFERRED (fundable) · **Priority:** 3 after product retain decision

| Layer | Scope |
|-------|--------|
| 1. Schema | New `blessboard` department tables (church/branch scoped) |
| 2. Service | CRUD + list/filter; no V4 `public` runtime |
| 3. Authorization | `branch_admin` / `church_hq_admin` |
| 4. Entitlement | All packages unless product gates later — **no** new plan key required for first slice |
| 5. Route | `/branch-admin/departments*` (HQ later, separate batch) |
| 6. Stitch GUI | `7ee4d401…` / `3794bd0c…` |
| 7. Tests | Scope isolation; CSRF; empty states |
| 8. Migration / deploy | Idempotent blessboard migration + catalogue entry; **do not** run against hosted until approved |

### Slice BB-04 — Duty roster  
**Class:** DEFERRED (fundable) · **Priority:** 4 — **separate** from departments

| Layer | Scope |
|-------|--------|
| 1. Schema | Roster / assignment tables (may reference department ids only if BB-03 shipped) |
| 2. Service | Roster CRUD + date-range queries |
| 3. Authorization | `branch_admin` / `church_hq_admin` |
| 4. Entitlement | Same as departments unless gated |
| 5. Route | `/branch-admin/duty-roster*` |
| 6. Stitch GUI | `37bdc9ea…` / `51d3e5bf…` |
| 7. Tests | Branch scope; no fabricated coverage metrics |
| 8. Migration / deploy | Separate migration from BB-03 |

### Slice BB-05 — Branch monthly reports (submit / history)  
**Class:** DEFERRED · **Priority:** 5 — **only if** product decides HQ aggregates are insufficient

| Layer | Scope |
|-------|--------|
| 1. Schema | Monthly report header + status/lines **or** explicit reject of V4 port |
| 2. Service | Submit / history / detail + transitions |
| 3. Authorization | `branch_admin` |
| 4. Entitlement | Tie to `basic_reports` only if product retains BA workflow |
| 5. Route | `/branch-admin/reports*` |
| 6. Stitch GUI | `d7bdddc0…` / `45a88626…` / history+detail pairs |
| 7. Tests | Status machine; no duplicate fake KPIs vs attendance/giving |
| 8. Migration / deploy | High risk; V4 map optional; HQ review = **separate** BB-06 |

### Deferred catalogue slices (not in next five — outline only)

Do **not** start until product elevates class to REQUIRED/OPTIONAL and scrub marketing if still DEFERRED.

| ID | Feature | Schema sketch | Entitlement key (catalogue) |
|----|---------|---------------|----------------------------|
| BB-06 | HQ monthly review | Depends on BB-05 | Growth ops (TBD) |
| BB-07 | HQ org templates | Template defs + apply audit | Growth+ if claimed |
| BB-08 | Scheduled communications | Schedule + outbox/worker | `broadcasts.scheduled` |
| BB-09 | Scheduled reports | Job queue + artifacts | `reports.scheduled` |
| BB-10 | Offline attendance | Sync queue + idempotency | `attendance.offline` |
| BB-11 | Surveys | Survey + response | `surveys.custom` |
| BB-12 | Appointments | Slots + bookings | `appointments.calendar` |
| BB-13 | Volunteer scheduling | Shifts + signups | `volunteers.scheduling` |
| BB-14 | Pastoral workflows beyond requests | Case engine | `care.automation` advanced |

Waiting verification / forgot password: **auth product programs** — not scheduled in the next five; remain **DEFERRED**.

---

## Recommended next five backend features (only)

| Order | Batch | Feature | Class | Why this order |
|------:|-------|---------|-------|----------------|
| 1 | **BB-01** | `max_branches` enforcement | REQUIRED FOR FOUNDATION | Honesty ROI; no DDL; unlocks capacity confidence |
| 2 | **BB-02** | HQ fixed-role assignment UI | OPTIONAL GROWTH | No schema; uses existing roles; improves ops without Network matrix |
| 3 | **BB-03** | Departments | DEFERRED → fund after retain decision | Highest-value Stitch ops domain; standalone |
| 4 | **BB-04** | Duty roster | DEFERRED | Separate from departments; do not merge |
| 5 | **BB-05** | Branch monthly reports | DEFERRED | Only after product confirms aggregates-only is insufficient; HQ review not in this five |

**Explicitly not in the next five:** prayer dedicated backend, create-org GUI, waiting verification, catalogue D2–D8, HQ templates, HQ monthly review.

---

## Agent-window schedule (next five)

| Window | Focus | Batch | Entry criteria | Exit criteria | Est. agent windows |
|--------|-------|-------|----------------|---------------|--------------------|
| **W1** | Capacity honesty | BB-01 | Max-branches audit accepted | Create/activate/downgrade tests green; docs updated | 1–2 |
| **W2** | HQ roles (fixed) | BB-02 | Product confirms fixed-three only (not Network matrix) | Assign/revoke + seat tests; Stitch chrome optional follow-on | 1–2 |
| **W3** | Departments | BB-03 | Product retains departments for V5 | Migration + CRUD + BA GUI + tests | 2–3 |
| **W4** | Duty roster | BB-04 | BB-03 done **or** explicit no-department dependency | Migration + roster GUI + tests | 2–3 |
| **W5** | Branch monthly | BB-05 | Product decision: BA monthly required | Schema + BA submit/history only (no HQ review) | 3–4 |

**Parallelism:** W1 may run alone anytime. W2 independent of W1. W3–W4 sequential if roster references departments. W5 gated by product decision M2.

**Stop conditions per window:** No unrelated feature bundling; no Network features; no invented roles; no hosted migration runs from agent without ops approval.

---

## Manual product decisions (still open)

| # | Decision | Blocks |
|---|----------|--------|
| M1 | Prayer CTA D1/D2 ([prayer decision](./PRAYER_REQUEST_FEATURE_DECISION.md)) | GUI FG-Q07 only — not BB-01…05 |
| M2 | Are HQ aggregates enough for Foundation “basic reporting”? | BB-05 / HQ monthly |
| M3 | Waiting verification vs permanent `/register/submitted` | Auth program |
| M4 | Elevate any catalogue D2–D8 to sold Growth? | BB-08…14 |
| M5 | Retain departments/duty Stitch for V5? | BB-03 / BB-04 |
| M6 | Create-org GUI | Already **KEEP CLI-ONLY** for cutover |

---

## Report summary

### 1. Required Foundation features
- **`max_branches` hard enforcement** — **shipped (BB-01)** on create / activate / HQ provision / downgrade.

### 2. Required Growth features
- **None** as new backend programs. Shipped: cross-branch HQ + `advanced_reports`.

### 3. Deferred items
- Waiting verification; departments; duty roster; branch + HQ monthly reports; HQ org templates; scheduled communications; scheduled reports; offline attendance; surveys; appointments; volunteer scheduling; pastoral-care workflows beyond requests; forgot password (auth).

### 4. Removed items
- Dedicated prayer **table**/schema product; create-org GUI for cutover; leader portal; banking/QR settings; Network domain/mailbox/API/advanced role matrix as Growth work.

### 5. Recommended next five vertical slices
1. ~~BB-01 `max_branches`~~ **done**
2. BB-02 HQ fixed-role assignment  
3. BB-03 Departments  
4. BB-04 Duty roster  
5. BB-05 Branch monthly reports (product-gated)

### 6. Agent-window schedule
See table above (W1–W5).

---

## Suggested documentation commit message

```text
Prioritize Foundation/Growth backend backlog with next five vertical slices.
```
