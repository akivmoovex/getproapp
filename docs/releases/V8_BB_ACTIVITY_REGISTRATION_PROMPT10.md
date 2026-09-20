# V8 PROMPT 10 — BlessBoard visitor, event & ministry registration (BB08–BB10)

**Branch:** `V8` only  
**Verdict:** `V8_BB_ACTIVITY_REGISTRATION_CODE_PASS`  
**Date:** 2026-09-21  
**Prerequisite:** Prompt 08 (`V8_SHARED_FORMS_END_TO_END_CODE_PASS`)  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014  
**Hosts:** Code + local automated tests only (no deploy / no migration apply / no real notifications)

## Flows

1. **Visitor (BB08):** Public `/visit` → consent submit → confirmation → authorized follow-up via shared review
2. **Event (BB09):** Admin publishes form linked to published event → attendee registers → capacity/closure enforced → review
3. **Ministry (BB10):** Admin publishes form linked to published ministry → applicant submits → authorized review (**never** grants privileged roles or login)

## Implementation

| Area | Detail |
|------|--------|
| Migration (additive, not applied overnight) | `db/migrations/platform/041_activity_registration_v8.sql` — categories `visitor`/`ministry`; linked resource; `registration_closed`; `max_submissions`; open-email uniqueness |
| Shared forms | Reuses `tenantFormService.submitPublicForm` / `reviewFormSubmission`; consent required; duplicate email blocked |
| BlessBoard wrapper | `activityRegistrationService.js` — publish/link, capacity sync with `events.capacity`, isolation, review without roles |
| Routes | Admin `/hq/activity-forms` + `/branch-admin/activity-forms`; public `/visit`, `/events/:id/register`, `/ministries/:id/register` |
| Views | `bb-activity-visitor/event/ministry/thanks/forms.ejs` with Stitch markers |

### Stitch map

| Screen | Desktop / Mobile | Surface |
|--------|------------------|---------|
| BB08 Visitor | `4386c842…` / `fe678af8…` | `bb-activity-visitor.ejs` · `/visit` |
| BB09 Event | `2eec86a5…` / `82394b58…` | `bb-activity-event.ejs` |
| BB10 Ministry | `122850b4…` / `d813732a…` | `bb-activity-ministry.ejs` |

## Tests

- `tests/v8-bb-activity-registration.test.js` — categories/V7 compat, visitor consent+duplicate, event capacity+closure, ministry isolation + no role grant, stitch markers
- Shared form builder + e2e regression **19/19 PASS**

## Non-goals

- Applying migration `041` on hosted testing DB
- Automatic login / password / ministry leadership role assignment
- Real notifications

## Preserve V7

Existing `general`/`registration`/`event`/`survey` categories unchanged; member portal participation paths untouched.
