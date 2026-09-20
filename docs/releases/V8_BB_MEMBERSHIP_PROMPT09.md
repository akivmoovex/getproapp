# V8 PROMPT 09 — BlessBoard membership workflow (BB01–BB08, BB11–BB18)

**Branch:** `V8` only  
**Verdict:** `V8_BB_MEMBERSHIP_CODE_PASS`  
**Date:** 2026-09-21  
**Prerequisite:** Prompt 08 (`V8_SHARED_FORMS_END_TO_END_CODE_PASS`)  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014  
**Hosts:** Code + local automated tests only (no deploy / no migration apply / no real notifications)

## Flows

1. **Church admin:** Membership forms dashboard (BB01) → create/edit/publish intake form (BB02)
2. **Visitor:** Multi-step apply (BB03–BB06) → confirmation (BB07); visitor surface (BB08)
3. **Reviewer:** Queue (BB11) → detail (BB12) → Approve / Needs follow-up / Decline (BB13)
4. **Approved:** Member profile (BB14) → edit (BB15) → branch transfer request/review (BB16)
5. **Directories:** HQ overview (BB17) · Branch overview (BB18)

## Implementation

| Area | Detail |
|------|--------|
| Migration (additive, not applied overnight) | `db/migrations/blessboard/110_membership_workflow_v8.sql` — intake forms, `application_json`, `needs_follow_up`, pastoral notes, append-only review events, branch transfer requests |
| Services | `membershipWorkflowService.js` — publish, multi-step submit, follow-up, pastoral gate, transfers, profile edit |
| Routes | `/hq/membership/*` and `/branch-admin/membership/*` via `membershipWorkflowAdminRoutes.js` |
| Public apply | `/register` uses `submitMembershipApplication` with optional spiritual/interests steps; still no login creation |
| Review | Existing approve/reject paths accept `needs_follow_up`; separate audit in `member_registration_review_events` |
| Privacy | Forbidden sensitive application keys rejected; pastoral notes require `pastoral_cases.view_restricted` |
| Isolation | Church + branch ownership; transfer destination must belong to same church |
| RBAC | HQ (`church_hq_admin`) and branch (`branch_admin`) via existing members.* permissions |

### Stitch map (required screens)

| Screen | Role | Primary surface |
|--------|------|-----------------|
| BB01 Forms dashboard | Admin | `bb-membership-forms.ejs` |
| BB02 Form create/edit | Admin | `bb-membership-form-edit.ejs` |
| BB03–BB06 Apply steps | Public | `public/register.ejs` (`data-bb-membership-step`) |
| BB07 Submitted | Public | `public/register-submitted.ejs` |
| BB08 Visitor register | Public | same register surface (`data-bb-membership="public-apply"`) |
| BB11 Review queue | Branch | `branch-admin/registrations.ejs` |
| BB12 Application detail | Branch | `branch-admin/registration-detail.ejs` |
| BB13 Review decision | Branch | registration detail (approve / follow-up / decline) |
| BB14 Member profile | HQ/Branch | `hq/member-detail.ejs`, `branch-admin/member-detail.ejs` |
| BB15 Member edit | HQ/Branch | member detail edit forms |
| BB16 Branch transfer | HQ/Branch | `bb-membership-transfer.ejs` + member transfer forms |
| BB17 HQ overview | HQ | `hq/members.ejs` |
| BB18 Branch overview | Branch | `branch-admin/members.ejs` |

## Tests

- `tests/v8-bb-membership.test.js` — publish + apply (no login), privacy forbidden keys, needs_follow_up → approve + audit, pastoral redaction, branch transfer + isolation, decline without member, stitch markers / V7 submit path

## Non-goals

- Applying migration `110` on hosted testing DB
- Automatic platform login / password creation on approve
- Real email/SMS notifications
- BB09–BB10 event/ministry registration (out of this prompt)
- BB19+ announcements (later prompts)

## Preserve V7

Existing `submitMemberRegistration` / approve / reject remain; new columns default safely; open uniqueness indexes include `needs_follow_up`.
