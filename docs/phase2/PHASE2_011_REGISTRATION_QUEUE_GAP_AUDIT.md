# PHASE2_011 — Registration Queue Gap Audit

**Date:** 2026-07-23  
**Mode:** Audit (Prompt 011) + queue view-parity implementation (Prompt 012 / Batch 3)  
**Route under audit:** `GET /admin/registration-applications`  
**View:** `views/blessboard/v5/platform-admin/registration-applications.ejs`  
**Service:** `listRegistrationApplicationsAdmin` → `normalizeListFilters`  
**Repository:** `listRegistrationApplications` / `countRegistrationApplications` / `buildRegistrationListWhere`

---

## Current queue capability matrix

| # | Capability | Status | What exists today |
|---|------------|--------|-------------------|
| 1 | **Search** | **COMPLETE** | GET `q`; SQL `ILIKE` on church name, contact name, email, phone, org key; LIKE metacharacters escaped; parameterized; truncated to 120 chars |
| 2 | **Status filter** | **COMPLETE** (Prompt 012) | UI exposes allowlisted `application_status` (plus operator `queue`; not duplicated as separate queue buckets) |
| 3 | **Follow-up filter** | **COMPLETE** (Prompt 012) | UI `follow_up_status` in More filters; allowlisted |
| 4 | **Provisioning-status filter** | **COMPLETE** (Prompt 012) | UI `provisioning_status` in More filters; allowlisted |
| 5 | **Requested-plan filter** | **COMPLETE** | UI `selected_plan` + SQL `a.selected_plan = $n`; plans foundation/growth/network |
| 6 | **Submitted-date filter** | **COMPLETE** | UI `from` / `to` (date inputs); SQL `created_at` range with exclusive end; invalid dates → 400 |
| 7 | **Assigned-admin filter** | **MISSING** | Assignee exists on rows (`assigned_support_user_id` / display name via JOIN) but **no** filter clause or UI control |
| 8 | **Country or region filter** | **MISSING** | `country`/`city` stored and shown; **no** filter |
| 9 | **Sorting** | **PARTIAL** | Repo allowlist `created_desc` / `created_asc`; service always sets `created_desc`; **no** UI sort control |
| 10 | **Pagination** | **COMPLETE** | DB `LIMIT`/`OFFSET` + parallel `COUNT(*)`; page/limit allowlist (10/25/50/100); prev/next when `totalPages > 1` |
| 11 | **Summary counts** | **PARTIAL** | Single filtered `total` in header. **No** Stitch-style bucket counters (New / Verification Pending / Info Requested / Ready / Failed) |
| 12 | **Desktop table** | **PARTIAL** | Desktop wrap: church, plan, contact, submitted, operator status + app/provision chips, next action, open. Missing Stitch verification/duplicate/assignee columns (deferred) |
| 13 | **Mobile cards** | **PARTIAL** | Card list with plan/date/contact/status/next + open CTA. Missing Stitch progress %, risk chip, counter strip (deferred) |
| 14 | **Empty queue** | **COMPLETE** (Prompt 012) | Distinct empty-state when no filters and no rows; no create-application CTA |
| 15 | **No-results state** | **COMPLETE** (Prompt 012) | Distinct copy + Clear filters when filters active and no rows |
| 16 | **Error state** | **COMPLETE** (Prompt 012) | Lookup failure → **503** in-shell `error-state` + Retry to canonical list; invalid filters → **400** |
| 17 | **Permission-restricted state** | **COMPLETE** | Apex + `requirePlatformAdmin`; unauthenticated → login redirect; non-admin → 403 (covered by existing tests) |
| 18 | **Verification summary** | **NOT SUPPORTED BY CURRENT DATA** | No persisted verification states on applications. Presentation helper exists (Batch 2) but queue must not invent pass/fail |
| 19 | **Duplicate-risk summary** | **PARTIAL** | `risk_decision` / `risk_reason_codes` on rows; Batch 2 duplicate-risk **display** mapping exists; list does **not** show risk chips or risk filter. Deriving a coarse chip from `risk_decision` is possible later without new columns |
| 20 | **Row actions** | **COMPLETE** for queue open-only (Prompt 012) | Single primary open (`Review` / `Retry` / `View` / `Continue`). Assign / contact / approve / reject / link / audit remain detail-only |

### Additional backend filters (not in Stitch audit list, present in code)

| Filter | UI | SQL |
|--------|----|-----|
| `queue` (operator) | Yes | Yes |
| `support_requested` | Yes (Prompt 012) | Yes |
| `requires_review` | Yes (Prompt 012) | Yes |
| `overdue_follow_up` | Yes (Prompt 012) | Yes |
| `linked` | Yes (Prompt 012) | Yes |

---

## Stitch comparison (Prompts 3 queue screens)

### Phase2 - 04 - Registration Applications - Desktop

| Field | Value |
|-------|--------|
| **Stitch name** | Phase2 - 04 - Registration Applications - Desktop |
| **Stitch ID** | `edbec80688324e80aeae2c80a9c605a3` |
| **Route** | `GET /admin/registration-applications` (existing) |
| **View** | `registration-applications.ejs` |
| **Main visual differences** | Stitch: summary counter strip; richer filter bar (status, duplicate risk, plan, assignee); Export / Guidelines; multi-action row menu. Live: ops guide aside; simpler filters; one primary CTA; BlessBoard shell (not Moovex) |
| **Main data differences** | Stitch shows verification progress and risk per row. Live has operator display status + application/provisioning chips; no verification progress; risk not shown |
| **Responsive** | Stitch wide table. Live hides table below desktop breakpoint in favor of cards |
| **Required backend change** | **None** for a minimal parity pass. Bucket counters / assignee filter / risk filter need queries or UI-only derive later |
| **Required view-only change** | Layout/copy polish; surface already-supported filters; empty/no-results split; optional risk chip from `risk_decision` only if honest |

### Phase2 - 04 - Registration Applications - Mobile

| Field | Value |
|-------|--------|
| **Stitch name** | Phase2 - 04 - Registration Applications - Mobile |
| **Stitch ID** | `8c042d7eef2d4755884c81757ca7cdd9` |
| **Route** | Same |
| **View** | Same EJS (cards) |
| **Main visual differences** | Stitch: top counter chips, sticky filters, verification % , risk on card. Live: filter form + cards + Review button |
| **Main data differences** | Same as desktop — no verification progress data |
| **Responsive** | Cards exist; counter strip and progress bars absent |
| **Required backend change** | None for minimal pass |
| **Required view-only change** | Card hierarchy / chip placement; reuse Batch 2 chips |

### Phase2 - 05 - Registration Applications Empty

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `4aa72e3fc2cc4e99bfd27bdc7a0b4ee7` | `1a9e631970da498094a336f19bd4ebcb` |

| Field | Value |
|-------|--------|
| **Route / view** | Same list route/view when `applications.length === 0` |
| **Main visual differences** | Stitch: tabs, Manual Invite, Clear/Refresh helpers. Live: `empty-state` + Clear in filter form |
| **Main data differences** | N/A |
| **Required backend change** | None |
| **Required view-only change** | Distinguish zero-total empty vs filtered no-results; **omit** Manual Invite (out of scope) |

**Manual Invite:** **NOT REQUIRED BY ACTUAL STITCH SCREEN** for BlessBoard product (Stitch decorative / out of scope per Batch 3 exclusions).

### Phase2 - 06 - Registration Applications Error

| Field | Desktop ID | Mobile ID |
|-------|------------|-----------|
| | `cf84867684754bcf92c6cb2c87187395` | `0ab863f5c111477486207b1b42a10a82` |

| Field | Value |
|-------|--------|
| **Route / view** | Failure uses `sendControlled` 503 HTML, not list EJS |
| **Main visual differences** | Stitch: in-shell error with Retry. Live: minimal standalone notice page |
| **Required backend change** | Optional: render list shell + `error-state` partial on lookup failure (same route) |
| **Required view-only change** | Prefer in-shell `error-state` + retry link to `/admin/registration-applications` |

---

## Query review

| Question | Finding |
|----------|---------|
| **N+1?** | **No.** One list `SELECT` with `LEFT JOIN` orgs / onboarding / support user; one `COUNT(*)` with same joins/where. Row mapping is in-memory only |
| **Filters in SQL or memory?** | **SQL** via `buildRegistrationListWhere` (except operator presentation labels after fetch) |
| **Pagination DB-backed?** | **Yes** — `LIMIT`/`OFFSET` + separate count |
| **Summary counts?** | Only filtered total count today. Stitch bucket counters would need **extra aggregated queries** (not implemented) |
| **Indexes?** | Present for `application_status+created`, `provisioning_status+created`, `selected_plan+created`, email, phone, assignee, risk_decision, support_requested. Search `ILIKE %…%` is not index-friendly (acceptable for admin volumes). Queue filters use multi-column predicates — may not hit a single composite index |
| **Search parameterized?** | **Yes** — bound params + `escapeLikePattern` + `ESCAPE '\\'` |
| **Sort allowlist?** | **Yes** — `SORT_OPTIONS`; unknown falls back to `created_desc` |
| **Unknown query params?** | Mostly **ignored** (not rejected). Invalid known params (`queue`, dates, boolean flags) → **400**. Unknown `application_status` / `provisioning_status` values are **coerced to null** (filter dropped), not 400 |

---

## Actions review

| Action | Functional today? | Where | Queue recommendation |
|--------|-------------------|-------|----------------------|
| **Open application** | Yes | List primary CTA → detail | **Remain visible** |
| **Assign** | Yes | Detail `POST …/assign-support` | **Remain only on the detail screen** (omit from queue row) |
| **Contact** | Yes | Detail `POST …/contact` | **Remain only on the detail screen** |
| **Link to organization** | Yes | Detail `POST …/link-organization` | **Remain only on the detail screen** |
| **Approve** | Yes | Detail `POST …/approve` | **Remain only on the detail screen** — Stitch inline Approve should **not** be added without check gates; **omit from Phase2 queue** |
| **Reject** | Yes | Detail `POST …/reject` | **Remain only on the detail screen** / **omit from Phase2 queue** |
| **View audit history** | Partial (merged on detail) | Detail | **Remain only on the detail screen** |

Stitch “more” / Assign / Approve on the row: **Be omitted from the Phase2 queue** for the smallest safe batch; keep open-only to avoid unsafe approvals without verification data.

---

## Largest Stitch mismatches (ranked)

1. **Verification / progress / risk columns and filters** — Stitch-heavy; **not supported by persisted verification data**; must not invent results.  
2. **Summary counter strip** — needs new aggregate queries or fake counts (exclude fakes).  
3. **In-shell error + empty/no-results differentiation** — view-level, low risk.  
4. **Unused backend filters missing from UI** — view-level, uses existing SQL.  
5. **Assignee / country filters** — need new WHERE clauses (small) or defer.

---

## Recommended next implementation

**One smallest batch:** Phase2 Batch 3 — **queue view parity (filters + empty/error), no new schema**

### Status — **COMPLETE** (2026-07-23, Prompt 012)

Implemented:

- All backend-supported filters exposed in the list GET form (compact + “More filters”); Clear filters only when active → `/admin/registration-applications`
- Distinct empty vs no-results empty-states; in-shell list error with Retry
- Desktop table + mobile cards; open/review primary action only
- Tests: `tests/blessboard-registration-queue-view-parity.test.js` (no Postgres)

Still deferred (out of this batch): verification progress/columns, duplicate-risk inventions, summary counters, assignee/country filters, queue Approve/Reject, Export / Manual Invite, new schema/routes.

### Files changed (Prompt 012)

- `views/blessboard/v5/platform-admin/registration-applications.ejs`
- `src/platform/http/platformAdminRoutes.js` (list error → shell + `error-state`; 400 for invalid filters unchanged)
- `public/blessboard/v5/platform-admin.css` (compact filter layout)
- `views/blessboard/v5/partials/platform-admin-shell-start.ejs` (`platform-admin.css?v=34`)
- `tests/blessboard-registration-queue-view-parity.test.js`

### Explicit exclusions (unchanged)

- Export / Manual Invite / Review Guidelines
- Summary bucket counters
- Verification progress percentages
- Assignee and country filters
- Inline approve/assign/reject from the queue
- New routes, migrations, repositories
- Stitch Moovex branding / Tenants nav
- Invented verification or duplicate results
- V4 / unrelated admin areas

---

## Runtime change confirmation

**Prompt 011:** docs only. **Prompt 012:** runtime queue view parity implemented as above.
