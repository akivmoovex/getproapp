# PHASE5_005 — Request Information and Needs Information Workflow

**Date:** 2026-07-25  
**Batch:** Phase 5 Prompt 5 of 7  
**Verdict:** `COMPLETE_WITH_DOCUMENTED_DIFFERENCES`  
**Stitch:** Request Information · Information Requested · Church Registration Needs Information (+ Mobile)

---

## Pre-implementation findings

| # | Question | Finding |
|---|----------|---------|
| 1 | Route | `POST /admin/registration-applications/:id/request-information` (canonical; retained) |
| 2 | CSRF | Required; failures redirect safely |
| 3 | Service | `recordInformationRequest` + `updateApplicationSupportFollowUp` |
| 4 | Application status | **Unchanged** |
| 5 | Follow-up status | Set to `awaiting_customer` |
| 6 | Review event | `action: information_requested` with reason codes, note length, delivery_status |
| 7 | Reviewer note | `internal_note` on communications row (optional) |
| 8 | Applicant-facing message | `applicant_message` on communications row (required by service) |
| 9 | Email sent? | Adapter attempted when `channel=email`; default adapter typically returns `sending_unavailable` |
| 10 | SMS sent? | No SMS channel; phone/other channels record as `recorded` without outbound send |
| 11 | Delivery result stored? | Yes — `delivery_status` / `delivery_error_code` on communication |
| 12 | Applicant responses? | Type allowlist includes `applicant_response` / inbound; **no applicant portal or reply ingestion** |
| 13 | Reminders? | **None** — no reminder route/service |
| 14 | Needs Information mapping | Prompt 2: `follow_up_status` ∈ `awaiting_customer` \| `needs_help` \| `self_onboarding` |

Backend is safe and canonical → proceed (not `BACKEND_BEHAVIOR_UNCLEAR`).

---

## Canonical route and action

| Step | Route | Behavior |
|------|-------|----------|
| Compose | `GET …/:id/request-information` | Phase 5 request form |
| Record | `POST …/:id/request-information` | Existing `recordInformationRequest` + follow-up update |
| Result | `GET …/:id/information-requested` | Honest result from latest stored communication |
| Needs focus | Same `GET …/:id` hub | Focused panel when visible status is Needs Information |

Secondary communications compose form still posts to the same POST.

---

## Actual outbound-delivery behavior

- Email channel **attempts** adapter send; usually `sending_unavailable`.
- Phone/other: `recorded` (no provider send).
- UI action label: **Record information request** (not Send).
- Result wording uses stored delivery only:
  - Information request recorded
  - Email sent (only `delivery_status=sent` + email)
  - Delivery failed
  - Delivery status unavailable

Stitch “Request Sent Successfully” / “Send Another Message” adapted away.

---

## Status transitions

| Field | Before | After |
|-------|--------|-------|
| `application_status` | unchanged (e.g. `submitted`) | **unchanged** |
| `follow_up_status` | any prior | `awaiting_customer` |
| Review event | — | `information_requested` appended |
| Communication | — | `information_request` row with message/notes/reasons/delivery |

---

## Visible Needs Information mapping

Shared `presentPhase5QueueStatus` (Prompt 2):

- Needs Information ← `awaiting_customer` | `needs_help` | `self_onboarding`
- No new backend enum

---

## Waiting and response-state behavior

Derived by `presentPhase5NeedsInformationState`:

- **Waiting:** latest information_request exists and no later `applicant_response` / inbound `applicant_message`
- **Review New Information:** only when that stored response exists
- **Record follow-up:** links to existing support follow-up form (`#reg-support-ops`)
- **Send Reminder:** not offered (unsupported)

---

## Result wording selected

Default / unavailable / recorded → **Information request recorded**  
Never “sent successfully” from follow-up or review event alone.

---

## Mobile

Same routes; CSS sticky record actions, large reason checkboxes, full-width message, needs-info stacked actions (`platform-admin.css?v=54`).

---

## Files changed

| File | Change |
|------|--------|
| `platformAdminRoutes.js` | GET compose/result; POST redirects to result; reason_codes from selected reasons |
| `registrationQueuePresentation.js` | Reasons, delivery wording, needs-info state helpers |
| `registration-application-request-information.ejs` | **New** compose page |
| `registration-application-information-requested.ejs` | **New** result page |
| `pa-registration-needs-information.ejs` | **New** hub focused state |
| `registration-application-detail.ejs` | Hub link + needs panel include |
| `pa-registration-detail-secondary.ejs` | `#reg-support-ops` id |
| `platform-admin.css` / shell `?v=54` | Request/needs styles |
| Tests + `PHASE5_005_*.md` | Coverage + this doc |

**Not changed:** communications table schema, email adapter, applicant portal, reminder scheduler, application_status enum.

---

## Tests and results

```bash
node --test \
  tests/blessboard-registration-request-information-flow-ui.test.js \
  tests/blessboard-registration-information-request-route.test.js \
  tests/blessboard-registration-information-request-form.test.js \
  tests/blessboard-registration-detail-overview.test.js \
  tests/blessboard-registration-queue-presentation.test.js
```

Expected: all pass after Prompt 5 fixes (see session run).

---

## Stitch assumptions adapted or blocked

| Stitch | Adaptation |
|--------|------------|
| Request sent successfully | Information request recorded |
| Send / paper-plane success | Record information request |
| Send Another Message | Record another request |
| Send Reminder | Record follow-up |
| Review New Information always | Only with stored response |
| Tax ID / founded / member count | Omitted (not on registration schema) |

---

## Remaining gaps

- No real outbound email/SMS productization
- No applicant reply portal
- No reminder delivery
- Secondary compose remains denser Phase 2 form (still valid)
