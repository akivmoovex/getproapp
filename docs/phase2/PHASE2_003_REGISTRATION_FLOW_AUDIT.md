# PHASE2_003 — Current Registration Flow Audit

**Date:** 2026-07-23  
**Mode:** Documentation only — no code changes  
**Capability legend:** `IMPLEMENTED` · `PARTIAL` · `MISSING` · `INCOMPATIBLE` · `OUT_OF_SCOPE`

---

## End-to-end path (today)

```text
Public apex GET/POST /register-church
  → validatePlatformChurchRegistration
  → evaluateRegistrationRisk (+ phone uniqueness / duplicates)
  → insert blessboard.platform_church_registration_applications
  → optional instant provision (Foundation/Growth flag)
  → Platform Admin GET /admin/registration-applications[/:id]
  → follow-up / assign / contact / reject / approve+provision / link / retry
  → organization_onboarding + optional mini-website via provisioner
```

---

## Capability matrix

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| **Public GET route** | **IMPLEMENTED** | `GET /register-church` in `apexMarketingRoutes.js`; view `apex/register-church.ejs` |
| **Public POST route** | **IMPLEMENTED** | `POST /register-church` (+ rate limiter); enquiry vs instant free/growth |
| **Validation** | **IMPLEMENTED** | `platformChurchRegistrationValidation.js` — name, country, city, contact, email, phone, plan, consent, honeypot; org key + password when instant provision |
| **Database table** | **IMPLEMENTED** | `blessboard.platform_church_registration_applications` (migrations 026–034) |
| **Stored fields** | **PARTIAL** | Core contact/church/plan/consent/risk/support/provision fields present; Stitch legal name, denomination, documents, WhatsApp, application number, verification flags **absent** (see 004) |
| **Repository methods** | **IMPLEMENTED** | `platformChurchRegistrationRepository.js` — create, idempotent create, list/count, get, lock, provisioning/support updates, contacts, link, admin list |
| **Service methods** | **IMPLEMENTED** | Public submit services + `registrationApplicationsAdminService.js` admin ops |
| **Application statuses** | **IMPLEMENTED** | `submitted` \| `duplicate_review` \| `rejected` \| `cancelled` \| `closed` (+ legacy `status` pending/contacted/closed) |
| **Provisioning statuses** | **IMPLEMENTED** | `not_started` \| `provisioning` \| `provisioned` \| `provisioning_failed` |
| **Approval flow** | **IMPLEMENTED** | `POST …/approve` → `approveAndProvisionRegistrationApplication` → `provisionRegisteredBlessBoardChurch`; Network requires validation statuses first |
| **Rejection flow** | **IMPLEMENTED** | `POST …/reject` → `rejectRegistrationApplication`; stores `rejection_reason`; no provision |
| **Duplicate handling** | **PARTIAL** | Phone uniqueness index; soft `duplicate_review`; risk codes `duplicate_phone`, `duplicate_email`, `similar_organization`, `prior_rejection`; **no** match list / comparison UI / explicit match decisions |
| **Email verification** | **MISSING** | `maybeSendRegistrationAcknowledgementEmail` is a **stub** (no-op); no magic-link / verified_at |
| **Phone verification** | **MISSING** | Phone normalized + uniqueness only; no call attempt verify flags; support contacts can log phone notes only |
| **Reviewer assignment** | **IMPLEMENTED** | `assigned_support_user_id` + `POST …/assign-support` + `assignRegistrationSupport`; admins from `listActivePlatformAdministrators` |
| **Notes** | **PARTIAL** | `review_notes`; support contacts with `internal_note` method; **no** structured reviewer-note thread UI like Stitch |
| **Communications** | **PARTIAL** | `organization_support_contacts` log (phone/email/message/meeting/internal_note); **no** outbound email/SMS verification events UI |
| **Audit history** | **PARTIAL** | JSONB `review_events` on application; org `auditEventService` when linked; detail merges into `auditEvents` — not a full verification audit product |
| **Onboarding linkage** | **IMPLEMENTED** | `organization_id` FK; `blessboard.organization_onboarding.registration_application_id`; ensure/update onboarding on provision |
| **Mini-website creation** | **PARTIAL** | Created as part of provision orchestrator / church public pages when provision succeeds — not a separate Phase2 “Website Setup” admin workspace |

---

## Public submission detail

| Item | Detail |
|------|--------|
| GET | `/register-church` |
| POST | `/register-church` |
| Validation | Required: church name, country, city, contact name, email, phone, consent; plan foundation/growth/network; optional role, branch fields, message; honeypot |
| Instant path | When flag on + foundation/growth: also org key + password; may auto-provision |
| Network path | Support-contact / enquiry; no auto-provision |
| Risk | `evaluateRegistrationRisk` → `allow` / `review_required` / `reject` |

### Typical stored columns (core)

`id`, `status` (legacy), `application_status`, `provisioning_status`, `church_name`, `country`, `city`, `contact_name`, `contact_email`, `contact_phone`, `contact_phone_normalized`, `role_in_church`, `branch_name`, `branch_count`, `selected_plan`, `message`, `consent_terms`, `review_notes`, `source_ip`, `user_agent`, timestamps, organization link, provisioning error fields, risk fields, `review_events`, support/follow-up fields, `network_validation_checklist`.

---

## Platform Admin handling detail

| Action | Route | Service |
|--------|-------|---------|
| List / filter | GET `/admin/registration-applications` | `listRegistrationApplicationsAdmin` |
| Detail | GET `/admin/registration-applications/:id` | `getRegistrationApplicationDetail` |
| Follow-up status | POST `…/follow-up-status` | `updateRegistrationFollowUpStatus` |
| Assign support | POST `…/assign-support` | `assignRegistrationSupport` |
| Contact / note | POST `…/contact` | `addRegistrationSupportContact` |
| Reject | POST `…/reject` | `rejectRegistrationApplication` |
| Approve + provision | POST `…/approve` | `approveAndProvisionRegistrationApplication` |
| Mark Network validation | POST `…/mark-validation-complete` | `markNetworkValidationComplete` |
| Retry provision | POST `…/retry-provision` | same approve orchestrator |
| Link org | POST `…/link-organization` | `linkRegistrationApplicationToOrganization` |

**Follow-up vocabulary (apps):** includes `new`, `contact_pending`, `call_pending`, `contacted`, `awaiting_customer`, `validation_pending`, `validation_in_progress`, `qualified`, `approved_for_provision`, `needs_help`, `self_onboarding`, `completed`, `unreachable`, `not_interested`.

**Operator queues (presenter):** `needs_review`, `provisioning_failed`, `network_validation`, `network_ready`, `provisioned`, `rejected`, `other`.

---

## Explicit Stitch gaps vs current flow

| Stitch expectation | Status |
|--------------------|--------|
| Application number (`#APP-…`) | **MISSING** (UUID only; can derive display) |
| Documents upload/review | **MISSING** |
| Email verification workspace | **MISSING** |
| Phone verification workspace | **MISSING** (log-only PARTIAL) |
| Duplicate match list + comparison decisions | **PARTIAL** / mostly **MISSING** UI |
| Approval checklist gate (generic Phase2) | **PARTIAL** (Network checklist only) |
| Verification overrides | **MISSING** as first-class |
| Website setup tab | **OUT_OF_SCOPE** / **PARTIAL** via provisioner |

---

## Incompatibilities

| Item | Note |
|------|------|
| Stitch “Moovex / Tenants / Super Admin” chrome | **INCOMPATIBLE** with BlessBoard V5 PA shell — reuse V5 nav, not Stitch labels |
| Stitch AI confidence / SMTP geolocation panels | **INCOMPATIBLE** with product policy (no AI fraud scoring; no inventing delivery telemetry) |
| Fine-grained PA permissions in Stitch | **INCOMPATIBLE** with single `platform_admin` role until/unless extended |

---

## Runtime change confirmation

No runtime code was modified for this audit.
