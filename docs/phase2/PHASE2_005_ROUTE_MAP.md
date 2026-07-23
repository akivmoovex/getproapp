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

### GET `/admin/registration-applications/:applicationId/duplicates`

| Field | Value |
|-------|--------|
| **Existing or new** | **New** |
| **Middleware** | Same |
| **Permission** | View applications |
| **CSRF** | N/A |
| **Service** | New `listRegistrationDuplicateMatches` (derive from risk + queries) |
| **Repository** | Existing duplicate finders + org name/city search; optional future child table |
| **View** | **New** `registration-application-duplicates.ejs` |
| **Validation** | UUID |
| **Redirect** | — |
| **Stitch** | 14 |

### GET `/admin/registration-applications/:applicationId/duplicates/:matchId`

| Field | Value |
|-------|--------|
| **Existing or new** | **New** |
| **Middleware** | Same |
| **Permission** | View applications |
| **CSRF** | N/A |
| **Service** | `getRegistrationDuplicateComparison` |
| **Repository** | Application + matched org/application by id |
| **View** | **New** `registration-application-duplicate-compare.ejs` |
| **Validation** | UUIDs; match may be org key or synthetic match id |
| **Redirect** | Invalid match → duplicates list |
| **Stitch** | 15 |

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
| **Resend email verification** | `POST …/:id/email-verification/resend` | **New** | mailer | token store | rate limit | **BACKEND_BLOCKED** until mailer |
| **Change applicant email** | `POST …/:id/email-verification/change-email` | **New** | update email + invalidate tokens | update `contact_email` | email format + confirm | Audit in `review_events` |
| **Manual email verification** | `POST …/:id/email-verification/manual-verify` | **New** | set verified_at | columns / events | confirm reason | High sensitivity — same role today |
| **Record duplicate decision** | `POST …/:id/duplicates/:matchId/decision` | **New** | record decision; may call link/reject | JSONB/child + existing link | decision enum | Reuse `linkRegistrationApplicationToOrganization` for “existing” |
| **Record verification override** | `POST …/:id/verification/override` | **New** | append allowlisted override | `review_events` | code + note | Prefer reuse audit JSONB |

### Existing POSTs to keep (not renamed)

| Path | Purpose |
|------|---------|
| `…/follow-up-status` | Workflow status |
| `…/reject` | Rejection |
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
