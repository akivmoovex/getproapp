# PHASE2_005 — Canonical Route Map

**Date:** 2026-07-23  
**Mode:** Design only — **routes not implemented**  
**Sources:** PHASE2_001–004  
**Auth baseline:** Apex host + `requirePlatformAdmin` (`platform_admin` role)  
**CSRF:** All POSTs require `validateCsrf` (`_csrf` + `blessboard_org_v5_csrf`)  
**Param convention:** Prefer existing `:id` in code; Phase2 docs may say `:applicationId` — treat as **same UUID param** (do not dual-mount unless needed).

---

## A. GET routes

### GET `/admin/registration-applications`

| Field | Value |
|-------|--------|
| **Existing or new** | **Existing** |
| **Middleware** | `requireApex`, `requirePlatformAdmin` |
| **Permission** | `platform_admin` — view applications |
| **CSRF** | N/A (GET) |
| **Service** | `listRegistrationApplicationsAdmin` |
| **Repository** | `listRegistrationApplications`, `countRegistrationApplications` |
| **View** | `views/blessboard/v5/platform-admin/registration-applications.ejs` |
| **Validation** | Query: `q`, `queue`, `selected_plan`, `from`, `to`, `page`, `limit` |
| **Redirect** | None |
| **Stitch** | 04 / 05 / 06 |

### GET `/admin/registration-applications/:applicationId`

| Field | Value |
|-------|--------|
| **Existing or new** | **Existing** (`:id`) — canonical hub for Overview + Details + Checklist sections |
| **Middleware** | `requireApex`, `requirePlatformAdmin` |
| **Permission** | View applications (+ sensitive details same role today) |
| **CSRF** | N/A |
| **Service** | `getRegistrationApplicationDetail` |
| **Repository** | `getRegistrationApplicationById`, contacts, admins, audit merge |
| **View** | `registration-application-detail.ejs` (**EXTEND**) |
| **Validation** | UUID id |
| **Redirect** | 404 → list or not-found flash |
| **Stitch** | 07, 08, 11 (sections); documents 09 may stay on hub until backend exists |

### GET `/admin/registration-applications/:applicationId/verification`

| Field | Value |
|-------|--------|
| **Existing or new** | **New** (or hash tab on detail — prefer **dedicated GET** for Stitch parity) |
| **Middleware** | Same |
| **Permission** | View applications |
| **CSRF** | N/A |
| **Service** | Extend detail service / new `getRegistrationVerificationView` deriving risk + uniqueness facts |
| **Repository** | Existing get + duplicate/risk helpers |
| **View** | **New** `registration-application-verification.ejs` or detail partial |
| **Validation** | UUID |
| **Redirect** | Missing app → detail/list |
| **Stitch** | 10 |

### POST `/admin/registration-applications/:id/phone-verification/attempts`

| Field | Value |
|-------|--------|
| **Existing or new** | **New** — **COMPLETE** (Prompt 030, 2026-07-24) |
| **Middleware** | `requireApex` + `requirePlatformAdmin` |
| **Permission** | Existing `platform_admin` gate (no new permission framework) |
| **CSRF** | Required |
| **Service** | `recordPhoneVerificationAttempt` |
| **Repository** | Via service only (`createPhoneVerificationAttempt`) |
| **Validation** | Route UUID + phone + dates + lengths + string enums; business rules in service |
| **Redirect** | 303 → `/admin/registration-applications/:id?notice=phone_attempt_recorded#reg-phone-verification` |
| **Audit** | Deferred — attempt row is append-only evidence; no separate audit event yet |
| **Stitch** | 12 |

### GET `/admin/registration-applications/:applicationId/phone-verification`

| Field | Value |
|-------|--------|
| **Existing or new** | **New** |
| **Middleware** | Same |
| **Permission** | View + act on phone verification (same role today) |
| **CSRF** | N/A |
| **Service** | New presenter over app + `listApplicationSupportContacts` |
| **Repository** | get app; list contacts filtered by phone |
| **View** | **New** `registration-application-phone-verification.ejs` |
| **Validation** | UUID |
| **Redirect** | — |
| **Stitch** | 12 |

### GET `/admin/registration-applications/:applicationId/email-verification`

| Field | Value |
|-------|--------|
| **Existing or new** | **New** |
| **Middleware** | Same |
| **Permission** | View + email verification actions |
| **CSRF** | N/A |
| **Service** | New — **BACKEND_BLOCKED** for real delivery until mailer exists; UI may show “not verified” from columns |
| **Repository** | get app; future verification columns |
| **View** | **New** `registration-application-email-verification.ejs` |
| **Validation** | UUID |
| **Redirect** | — |
| **Stitch** | 13 |

### GET `/register/email-verification/:token` (+ result)

| Field | Value |
|-------|--------|
| **Existing or new** | **New — COMPLETE (041)** |
| **Middleware** | Apex host only; **no** auth; public rate limit |
| **Permission** | Public (token is the credential) |
| **CSRF** | N/A (GET consume) |
| **Service** | `consumeVerificationToken` |
| **Repository** | `registration_email_verification_tokens` |
| **View** | `apex/email-verification-result.ejs` via `/register/email-verification/result` |
| **Validation** | Token present; generic failure otherwise |
| **Redirect** | `303` → tokenless result (`outcome=verified|invalid`); never to `/admin` |
| **Stitch** | 13 (public consume) |

### GET `/admin/registration-applications/:applicationId/duplicates`

| Field | Value |
|-------|--------|
| **Existing or new** | **New — COMPLETE (049)** |
| **Middleware** | `requireApex` + `requirePlatformAdmin` |
| **Permission** | Platform admin (same as application detail) |
| **CSRF** | N/A (GET read-only) |
| **Loader** | `loadRegistrationDuplicateMatchesForAdmin` → `listDuplicateMatches` (048) once |
| **Service** | `registrationDuplicateMatchQueryService.listDuplicateMatches` |
| **Repository** | Match ledger (047) + batched record enrichment (048) |
| **View** | `registration-application-duplicates.ejs` (Platform Admin shell) — **COMPLETE** screen (050): mobile cards, empty/error states, advisory score/risk/reasons |
| **Validation** | Application UUID |
| **Redirect** | — |
| **States** | Empty + error; no auto merge/reject; no decision POST; no unrelated user identities |
| **Stitch** | 14 |
| **Tests** | Route: `blessboard-registration-duplicate-matches-route.test.js`; screen: `blessboard-registration-duplicate-matches-screen.test.js` |

### GET `/admin/registration-applications/:applicationId/duplicates/:matchId`

| Field | Value |
|-------|--------|
| **Existing or new** | **New — COMPLETE (049)** |
| **Middleware** | `requireApex` + `requirePlatformAdmin` |
| **Permission** | Platform admin |
| **CSRF** | N/A (GET read-only) |
| **Loader** | `loadRegistrationDuplicateComparisonForAdmin` → `getDuplicateComparison` (048) once |
| **Service** | `registrationDuplicateMatchQueryService.getDuplicateComparison` |
| **Repository** | Match row + subject application + matched record (approved fields only) |
| **View** | `registration-application-duplicate-compare.ejs` (Platform Admin shell) — **COMPLETE** screen (051) + decision UI (053): desktop side-by-side + mobile attribute cards; text+icon match highlights; decision form (CSRF, review state, notices); no auto merge/approve/reject |
| **Validation** | Application + match UUIDs |
| **Redirect** | Unknown match → `303` → duplicates list |
| **States** | Error state; decision form when comparison loads; flash notice/error; no auto merge/reject/approve |
| **Stitch** | 15 |
| **Tests** | Route: `blessboard-registration-duplicate-matches-route.test.js`; screen: `blessboard-registration-duplicate-comparison-screen.test.js` |

---

## B. POST actions (canonical)

Unless noted: **Middleware** = `requireApex` + `requirePlatformAdmin`; **CSRF** = required; **Redirect** = 303 back to relevant GET with `?notice=` / `?error=`.

| Action | Suggested path | Existing or new | Service | Repository | Validation | Notes |
|--------|----------------|-----------------|---------|------------|------------|-------|
| **Assign reviewer** | `POST …/:id/assign-support` | **Existing** | `assignRegistrationSupport` | update `assigned_support_user_id` | admin user id | Prefer existing over new `/assign-reviewer` |
| **Add reviewer note** | `POST …/:id/contact` | **Existing** | `addRegistrationSupportContact` | insert support contact | method `internal_note`, note text | Prefer existing |
| **Run checks** | `POST …/:id/run-checks` | **New** | new re-eval risk / uniqueness | read + append `review_events` | confirm | Reuses `evaluateRegistrationRisk` patterns |
| **Record phone call (CRM)** | `POST …/:id/contact` (method phone) | **Existing** | `addRegistrationSupportContact` | support contacts | method/outcome/note | Remains CRM-only |
| **Record phone verification attempt** | `POST …/:id/phone-verification/attempts` | **New — COMPLETE (030)** | `recordPhoneVerificationAttempt` | `registration_phone_verification_attempts` | outcome/identity/authority/result | Append-only; audit event deferred |
| **Verify phone (discrete)** | `POST …/:id/phone-verification/verify` | **New** | set phone verified | nullable columns / review_events | confirm | Still deferred; may share attempt form later |
| **Resend email verification** | `POST …/:id/email-verification/resend` | **New — COMPLETE (039)** | `resendRegistrationVerificationEmail` → token create + message builder + send adapter | token store | CSRF + cooldown + email validate | Honest `email_sending_unavailable` until real mailer; never exposes plaintext token |
| **Change applicant email** | `POST …/:id/email-verification/change-email` | **New** | update email + invalidate tokens | update `contact_email` | email format + confirm | Audit in `review_events` |
| **Manual email verification** | `POST …/:id/email-verification/manual-verify` | **New** | set verified_at | columns / events | confirm reason | High sensitivity — same role today |
| **Record duplicate decision** | `POST …/:id/duplicates/:matchId/decision` | **New — COMPLETE (052)**; UI **COMPLETE (053)** | `recordDuplicateMatchReviewDecision` | `recordRegistrationDuplicateMatchDecision` + `review_events` (+ org audit when linked) | allowlisted decision; reason required for strong override / different_church on strong / impersonation_concern / confirmed_duplicate | **No** merge/reject/approve/provision; CSRF; session reviewer; form on compare screen; redirect to compare or list |
| **Record verification override** | `POST …/:id/verification/override` | **New** | append allowlisted override | `review_events` | code + note | Prefer reuse audit JSONB |
| **Registration communications storage** | *(no route yet for compose UI)* | **Storage COMPLETE (062)**; **Service COMPLETE (063)** | `registrationApplicationCommunicationService` | `registration_application_communications` + create/list/findLatest; rejection metadata via `updateRegistrationRejectionMetadata` | allowlisted type/channel/direction/delivery; request categories | Append-only ledger; honest `sending_unavailable` |
| **Request additional information** | `POST …/:id/request-information` | **New — COMPLETE (064)** | `recordInformationRequest` + `updateApplicationSupportFollowUp` | communications insert + follow-up `awaiting_customer` + `review_events` (`information_requested`) | CSRF; platform_admin; form fields only (no form actor/app ids) | Does **not** change `application_status`; notice `information_requested`; never claims email sent when unavailable |
| **Reject registration** | `POST …/:id/reject` | **Route UPGRADED (069)**; service **COMPLETE (068)** | `rejectRegistrationApplication` + `recordRejectionNotice` | `application_status=rejected`; `rejection_reason`; metadata; optional `rejection_notice` | CSRF; platform_admin; allowlisted category; require internal note; require applicant explanation when notify; form never supplies actor/app ids or delivery status | Redirect `?notice=application_rejected#reg-rejection`; legacy `rejection_reason` still accepted; no raw DB/mailer errors |
| **Reopen rejected application** | `POST …/:id/reopen` | **New — COMPLETE (071)** | `reopenRegistrationApplication` | `application_status=submitted`; append `review_events` `reopen`; **preserve** `rejection_reason` + metadata + communications | CSRF; platform_admin; reason required; only when currently `rejected` | Redirect `?notice=application_reopened`; no email; form never supplies admin id or status |

### Existing POSTs to keep (not renamed)

| Path | Purpose |
|------|---------|
| `…/follow-up-status` | Workflow status |
| `…/reject` | Rejection |
| `…/reopen` | Reopen rejected application |
| `…/approve` | Approve + provision |
| `…/mark-validation-complete` | Network validation |
| `…/retry-provision` | Retry |
| `…/link-organization` | Link to existing org |

---

## C. Preference rules

1. Prefer **existing** list/detail/assign/contact/reject/approve/link routes.  
2. Add **new GETs** for verification / phone / email / duplicates workspaces to match Stitch without overloading one EJS file indefinitely.  
3. Do **not** invent `/admin/tenants` or Moovex paths.  
4. Shell/nav changes stay in `platformAdminNav.js` + shell partials (Prompt 1).

---

## Runtime change confirmation

No routes were implemented in this document.
