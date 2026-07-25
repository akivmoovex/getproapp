# PHASE5_002 — Church Registration Queue Implementation

**Date:** 2026-07-25  
**Batch:** Phase 5 Prompt 2 of 7 (queue + empty + mobile)  
**Stitch:** Church Registrations · Empty State · Church Registrations - Mobile  
**Canonical route:** `GET /admin/registration-applications` (unchanged)

---

## Verdict

Phase 5 queue presentation is implemented on the **existing** list route, service, and repository. No migration, no parallel queue API, no detail/approval changes.

---

## Files changed

| File | Change |
|------|--------|
| `src/blessboard/services/registrationQueuePresentation.js` | **New** shared Phase 5 status/date/action/filter helpers |
| `src/platform/http/platformAdminRoutes.js` | Apply `visible_status` → existing filters; page title “Church Registrations” |
| `src/platform/http/platformAdminShellLocals.js` | Inject `registrationQueue`; default title |
| `src/platform/http/platformAdminNav.js` | Nav label “Church Registrations”, icon `church` |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | Fallback nav label/icon; CSS `?v=51` |
| `views/blessboard/v5/platform-admin/registration-applications.ejs` | Phase 5 desktop table + mobile cards + empty/no-result/error |
| `public/blessboard/v5/platform-admin.css` | Phase 5 queue card/table styles |
| `tests/blessboard-registration-queue-presentation.test.js` | **New** mapping tests |
| `tests/blessboard-registration-queue-view-parity.test.js` | Updated for Phase 5 markup/copy |
| `tests/blessboard-admin-registration-applications.test.js` | List assertions for Phase 5 queue |
| `tests/blessboard-platform-admin-registration-nav.test.js` | Nav label updates |
| `docs/phase5/PHASE5_002_REGISTRATION_LIST_IMPLEMENTATION.md` | This document |

**Not changed:** `registration-application-detail.ejs`, approve/reject/provision services, repository queries, status enums.

---

## Canonical reuse

- **Route:** `GET /admin/registration-applications` in `platformAdminRoutes.js`
- **Service:** `listRegistrationApplicationsAdmin`
- **Repository:** `listRegistrationApplications` / `countRegistrationApplications` (via service)
- **Auth:** apex + `platform_admin` + `Cache-Control: no-store`
- **Ordering:** newest first (existing repository default)

---

## Exact visible-status mapping

Presentation helper: `presentPhase5QueueStatus(row)` in `registrationQueuePresentation.js`.  
**Does not** rename stored enums or add a four-status backend model.

| Visible label | Key | Derived from canonical combination |
|---------------|-----|--------------------------------------|
| **Rejected** | `rejected` | `application_status` ∈ {`rejected`, `cancelled`} |
| **Approved** | `approved` | `provisioning_status` = `provisioned` **OR** (`application_status` = `closed` **and** linked org id/key) |
| **Needs Information** | `needs_information` | `follow_up_status` ∈ {`awaiting_customer`, `needs_help`, `self_onboarding`} (after `call_pending`→`contact_pending` normalize on other paths only; these three are checked as stored) |
| **New** | `new` | Everything else still in the operator queue (e.g. `submitted`, `duplicate_review`, network validation, ready for approval, `provisioning`, `provisioning_failed`) |

Notes:

- There is **no** stored `approved` application status; Approved is derived from provisioning / linked closed apps.
- Primary row action is always **Review** → `/admin/registration-applications/:id` (not org View).

---

## Filters shown versus preserved

### Shown in primary Phase 5 UI

- Search (`q`)
- Visible status (`visible_status`) — maps via `applyVisibleStatusQuery`:
  - `new` → `queue=needs_review` (if `queue` unset)
  - `needs_information` → `follow_up_status=awaiting_customer` (if unset)
  - `approved` → `queue=provisioned` (if unset)
  - `rejected` → `queue=rejected` (if unset)
- Plan (`selected_plan`)
- Per page (`limit`)

### Preserved but hidden (More filters disclosure + URL)

- `queue` (operator queues)
- `application_status`
- `provisioning_status`
- `follow_up_status`
- `from` / `to`
- `support_requested`
- `requires_review`
- `overdue_follow_up`
- `linked`

Explicit advanced params are **not overwritten** by `visible_status` mapping when already set.

---

## Desktop implementation

- Title: **Church Registrations**
- Lede: Review and manage churches applying to join BlessBoard
- Table columns: Church name · Location · Contact person · Phone · Plan · Date · Status · Action (Review)
- Phase 5 status chips only (no provisioning/follow-up dual chips in the row)
- No org keys, UUIDs, emails, or technical scores as columns
- Total count shown only when `total > 0` (no fabricated status counter cards)
- Existing pagination retained

## Mobile implementation

- Same route and data
- Card layout: church + status header; location, contact, phone, plan, date; large block **Review** button
- No horizontal scroll; uses existing `bb-pa-orgs-cards` show/hide breakpoints

## Empty / no-result / error

| State | Marker | Copy / action |
|-------|--------|----------------|
| True empty | `data-bb-pa-reg-state="empty"` | “No church registrations yet” + Return to Dashboard (`/admin`) |
| Filtered empty | `data-bb-pa-reg-state="no-results"` | “No registrations match these filters” + Clear filters |
| Backend error | `data-bb-pa-reg-list-error="1"` | Error-state partial + Retry (not the cheerful empty design) |

Stitch empty-state “Manual Registration” CTA and decorative tip cards were **not** implemented (would invent create flows / non-backed marketing).

---

## Tests and results

### Selected files (why)

| File | Why |
|------|-----|
| `blessboard-registration-queue-presentation.test.js` | Visible-status mapping, date/location, Review action, query mapping |
| `blessboard-registration-queue-view-parity.test.js` | Markup, filters, empty/no-result/error, mobile cards, labels, pagination |
| `blessboard-platform-admin-registration-nav.test.js` | Nav label/auth/active state |
| `blessboard-admin-registration-applications.test.js` | Live list route, auth, filters, search, no-results |

### Commands

```bash
node --test \
  tests/blessboard-registration-queue-presentation.test.js \
  tests/blessboard-registration-queue-view-parity.test.js \
  tests/blessboard-platform-admin-registration-nav.test.js \
  tests/blessboard-admin-registration-applications.test.js
```

### Results

**40 pass / 0 fail** (5 suites)

---

## Known differences from Stitch

1. **No fabricated KPI cards** (“+3 since yesterday”, pending/total tiles) — not backed by real queries.
2. **No Manual Registration** empty-state CTA — forbidden inventing create/invite from queue.
3. **No decorative empty-state tip cards** (Auto-Verification / Fast Track / Bulk Invites).
4. **Plan labels** remain Foundation / Growth / Network (product truth), not Stitch “Basic/Enterprise”.
5. **Nav** still includes full platform-admin items beyond Stitch’s shortened admin chrome.
6. **Visible status → queue mapping** for “New” uses `needs_review` queue (approximation); Network-validation-only rows may require More filters / All statuses.
7. Shell CSS version bumped to **v=51**.

---

## Next recommended prompt

**Phase 5 Prompt 3** — decision-focused Review Church Registration (desktop + mobile + duplicate warning presentation), reusing detail route without weakening approval backend.
