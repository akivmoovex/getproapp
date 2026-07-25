# PHASE5_006 — Church Registration Rejection Workflow

**Date:** 2026-07-25  
**Batch:** Phase 5 Prompt 6 of 7  
**Verdict:** `COMPLETE_WITH_DOCUMENTED_DIFFERENCES`  
**Stitch:** Reject Church Registration · Church Registration Rejected · Reject Church Registration - Mobile

---

## Pre-implementation findings

| # | Question | Finding |
|---|----------|---------|
| 1 | Canonical rejection route | `POST /admin/registration-applications/:id/reject` |
| 2 | HTTP method | **POST only** (no destructive GET) |
| 3 | CSRF | Required via `validateCsrf` / `CSRF_FIELD` |
| 4 | Authorization | `requirePlatformAdmin` + Apex host |
| 5 | Service | `rejectRegistrationApplication` |
| 6 | Allowed source statuses | `submitted`, `duplicate_review` |
| 7 | Resulting application status | `rejected` |
| 8 | Follow-up status | **Unchanged** by rejection |
| 9 | Rejection reason storage | `rejection_reason` (internal note text, min 3 chars) + optional `rejection_category` allowlist |
| 10 | Internal note separate? | Same field as `rejection_reason` / `internal_decision_note` (not a separate column) |
| 11 | Applicant-facing message | Optional `applicant_explanation` → `recordRejectionNotice` when present |
| 12 | Outbound email/SMS | Email adapter attempted only when notice recorded + `notifyApplicant`; typically `sending_unavailable`. No SMS productization |
| 13 | Review event | `action: "reject"` with category, note lengths, notification_status |
| 14 | Rejecting administrator | `actor_user_id` on review event |
| 15 | Linked / provisioned protection | Blocks when `organization_id` set or `provisioning_status === provisioned` |
| 16 | Reopen | Canonical `POST …/:id/reopen` (rejected → `submitted`); history preserved |

Backend is clear → proceed (not `BACKEND_BEHAVIOR_UNCLEAR`).

---

## Canonical route and service

| Step | Route | Behavior |
|------|-------|----------|
| Confirm | `GET …/:id/reject` | Phase 5 confirmation; blocked panel when not rejectable |
| Reject | `POST …/:id/reject` | Existing `rejectRegistrationApplication` |
| Result | `GET …/:id/rejected` | Result from stored application + communications |
| Reopen | `POST …/:id/reopen` | Existing reopen (shown only when `canReopen`) |

Hub **Reject registration** / **Reject as Duplicate** → dedicated `/reject` (duplicate preselects `rejection_category=duplicate_registration`).

Secondary `#reg-rejection` workspace retained and still posts to the same POST.

---

## Rejectability rules

Rejectable when:

- `application_status` ∈ `submitted` \| `duplicate_review`
- No `organization_id`
- `provisioning_status` ≠ `provisioned`
- Detail flag `rejectActionsAvailable` is true

Already `rejected` → GET `/reject` redirects to `/rejected` (idempotent service path also returns `alreadyRejected`).

Blocked GET shows plain-language explanation + organization link when available; no form mutate.

POST re-validates via service lock (not browser status alone).

---

## Application-status and follow-up transitions

| Field | Before | After |
|-------|--------|-------|
| `application_status` | `submitted` or `duplicate_review` | `rejected` |
| `follow_up_status` | any prior | **unchanged** |
| Review event | — | `reject` appended |
| Visible queue label | via `presentPhase5QueueStatus` | **Rejected** |

---

## Reason, note, and event storage

- Visible Phase 5 reasons map onto existing `REJECTION_CATEGORIES` (no new enum / migration):
  - Duplicate church → `duplicate_registration`
  - Invalid contact details → `contact_not_verified`
  - Incomplete or unverifiable → `invalid_or_incomplete_information`
  - Not a church organization → `unsupported_organization_type`
  - Test or spam → `fraudulent_or_prohibited_use`
  - Other → `other` (still requires free-text note)
- When a non-`other` category is selected without a typed note, `parseRejectForm` stores the allowlisted category label into `internal_decision_note` / `rejection_reason`.
- Optional applicant explanation stored as `rejection_notice` communication when provided.
- Review event records actor, category, note lengths, notify flag, notification status.

---

## Communication-delivery behavior

Wording from stored `rejection_notification_status` / notice delivery only:

| Stored | UI label |
|--------|----------|
| missing / `recorded` / other | **Rejection recorded** |
| `sent` | **Email sent** |
| `sending_unavailable` / `queued` | **Delivery unavailable** |
| `failed` | **Delivery failed** |

Never claims applicant notified from status update alone. Phase 5 confirm page does not claim outbound send.

---

## Duplicate-context behavior

- Preselect via validated query `rejection_category=duplicate_registration` (allowlisted only).
- Duplicate banner from server-loaded `presentPhase5DuplicateWarning` (not uncontrolled query evidence).
- Safe existing-record link when present.
- No merge, delete, org mutation, or duplicate-resolution write unless already part of canonical reject (it is not).

---

## Linked / provisioned safeguards

- Service rejects with `already_provisioned` / `not_eligible`.
- GET confirmation shows blocked panel; hub hides Reject when `rejectActionsAvailable` is false.
- No organization / church / user / invitation deletion.

---

## Reopen capability

Canonical reopen **is supported**. Rejected result shows Reopen form when:

- `application_status === rejected`
- No `organizationId`
- Not provisioned

Otherwise omitted (no dead button). Reopen POST unchanged (redirects to review hub).

---

## Mobile implementation

Same routes/templates. CSS (`platform-admin.css?v=55`):

- Single-column reject layout
- Large reason radios
- Full-width notes
- Sticky destructive confirm actions under 719px
- Overflow wrap for long church names / emails

No mobile-specific backend route.

---

## Files changed

- `src/platform/http/platformAdminRoutes.js` — GET `/reject`, GET `/rejected`, POST redirect to `/rejected`, injectable detail, `parseRejectForm` category-label fill, `already_provisioned` error map
- `src/blessboard/services/registrationQueuePresentation.js` — `PHASE5_REJECT_REASONS`, `presentPhase5RejectionSummary`
- `views/blessboard/v5/platform-admin/registration-application-reject.ejs` (new)
- `views/blessboard/v5/platform-admin/registration-application-rejected.ejs` (new)
- `views/blessboard/v5/platform-admin/registration-application-detail.ejs` — hub reject links + hide unsafe reject
- `views/blessboard/v5/partials/platform-admin-shell-start.ejs` — CSS `?v=55`
- `public/blessboard/v5/platform-admin.css` — reject/rejected mobile styles
- `tests/blessboard-registration-reject-route.test.js` — redirects + GET coverage
- `tests/blessboard-registration-rejection-flow-ui.test.js` (new)
- `tests/blessboard-registration-detail-overview.test.js` — hub reject href
- `tests/blessboard-registration-request-information-flow-ui.test.js` — CSS version assert
- `docs/phase5/PHASE5_006_REJECTION_FLOW_IMPLEMENTATION.md` (this file)

---

## Tests and results

Narrow:

```bash
node --test tests/blessboard-registration-reject-route.test.js \
  tests/blessboard-registration-rejection-flow-ui.test.js \
  tests/blessboard-registration-detail-overview.test.js
```

Result: **40 pass / 0 fail / 0 skipped**

Broader related:

```bash
node --test \
  tests/blessboard-registration-reject-route.test.js \
  tests/blessboard-registration-rejection-flow-ui.test.js \
  tests/blessboard-registration-detail-overview.test.js \
  tests/blessboard-registration-rejection-workspace-ui.test.js \
  tests/blessboard-registration-rejection-service.test.js \
  tests/blessboard-registration-rejection-service-pg.test.js \
  tests/blessboard-registration-reopen-route.test.js \
  tests/blessboard-registration-request-information-flow-ui.test.js \
  tests/blessboard-registration-information-request-route.test.js \
  tests/blessboard-registration-information-request-form.test.js \
  tests/blessboard-registration-approval-flow-ui.test.js \
  tests/blessboard-registration-communications-history-ui.test.js \
  tests/blessboard-platform-admin-mobile-nav.test.js \
  tests/blessboard-registration-email-verification-ui.test.js
```

Result: **131 pass / 0 fail / 0 skipped**

Intentionally updated:

- Reject-route success/error redirects from `#reg-rejection` → `/reject` and `/rejected`
- Detail overview reject href to `/reject`
- CSS cache asserts `platform-admin.css?v=55` across related UI tests after shell bump

---

## Stitch differences

| Stitch | Adaptation |
|--------|------------|
| “Applicant notified” / send success copy | **Rejection recorded** unless verified `sent` |
| Separate rejection-reason enum | Mapped to existing categories |
| Delete / merge duplicate | Not implemented (out of scope; records preserved) |
| Dead Reopen | Shown only when canonical reopen is allowed |
| Dedicated mobile routes | Same desktop routes + responsive CSS |

---

## Remaining gaps

- Secondary `#reg-rejection` workspace remains available under Additional review details (intentional dual surface).
- Reopen after Phase 5 result still lands on review hub (existing POST), not a dedicated “reopened” Stitch screen.
- No SMS productization; notify checkbox remains on secondary form only (Phase 5 page records optional applicant message without claiming send).
