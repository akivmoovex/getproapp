# PHASE5_001 — Existing Church Registration Admin Implementation Audit

**Date:** 2026-07-25  
**Mode:** Analysis only — **no application code, migrations, routes, views, CSS, or tests were modified**  
**Canonical product:** BlessBoard V5 platform-admin (apex host + `platform_admin`)  
**Stitch project:** GetPro Church Platform (`projects/17124191473876947591`)  
**Visual source of truth:** Phase 5 Stitch screens (20 found; exact titles match prompt list)  
**Behavioral source of truth:** Existing V5 services, repositories, DB constraints, and tests

---

## Executive verdict

**REUSE AND SIMPLIFY PRESENTATION — DO NOT REPLACE THE BACKEND**

Phase 2 already delivered a full registration review/approval stack: list + mega-detail page, approve/provision, reject/reopen, request-information, duplicates, verification evidence, communications ledger, and CSRF/`platform_admin` gates. Phase 5 Stitch redesigns the **decision-focused operator experience**. The current detail page (~2,600 lines EJS) is the primary complexity to reduce. Backend controls must stay intact.

---

## Stitch inventory (Phase 5)

All 20 requested screens exist in Stitch project `17124191473876947591`:

| # | Stitch title | Screen ID | Device |
|---|--------------|-----------|--------|
| 1 | Phase5 - Review Church Registration | `a38084de8e4849f3adbb16d33f2b605d` | DESKTOP |
| 2 | Phase5 - Church Registrations | `9d625ee66dee4f19b5a6e932a343d5f8` | DESKTOP |
| 3 | Phase5 - Church Registrations - Empty State | `afaba90c14f84c8198c0ec249257a7e8` | DESKTOP |
| 4 | Phase5 - Approve Church Confirmation | `650a5fe89e4742e8a549145d45ecde97` | DESKTOP |
| 5 | Phase5 - Church Approval Processing | `afba3b471854462c834080134d0bfae6` | DESKTOP |
| 6 | Phase5 - Review Church Registration - Duplicate Warning | `01b0ebbd9c4c4ab4b680239b2d0a7ace` | DESKTOP |
| 7 | Phase5 - Church Approved | `99cb9fe216db4a388584e658e15e9a9e` | DESKTOP |
| 8 | Phase5 - Request Information | `0e662b1cf0cd4bcea9f6ef7967c4313b` | DESKTOP |
| 9 | Phase5 - Reject Church Registration | `06cb9310704e47f1aad776a3d10923fd` | DESKTOP |
| 10 | Phase5 - Church Registration Rejected | `0498c44cda4e4af8be3799fdb1a48f94` | DESKTOP |
| 11 | Phase5 - Information Requested | `bb56eda00126437b9871f5060774c0ae` | DESKTOP |
| 12 | Phase5 - Church Registration Needs Information | `696dd415a91a472eb21d00d964ada09d` | DESKTOP |
| 13 | Phase5 - Church Registrations - Mobile | `9be8b350e6e84793bc8005f07ecb9304` | MOBILE |
| 14 | Phase5 - Review Church Registration - Mobile | `6e776136924d475bba373301231d4a0e` | MOBILE |
| 15 | Phase5 - Review Church Registration - Duplicate Warning - Mobile | `c064345b8a5543caaa541c93f321b1dd` | MOBILE |
| 16 | Phase5 - Church Approved - Mobile | `4670b6daff614ee19e131c5b99d62934` | MOBILE |
| 17 | Phase5 - Approve Church Confirmation - Mobile | `b05de335b26e4344b9e8ee00b6d0aab8` | MOBILE |
| 18 | Phase5 - Request Information - Mobile | `d2625eca797840b4b56ba6029fefa3c1` | MOBILE |
| 19 | Phase5 - Reject Church Registration - Mobile | `760c20d2d747471f87324664b6e7721b` | MOBILE |
| 20 | Phase5 - Church Registration Needs Information - Mobile | `42835fd0e9d74a8bbb1c940e5f8668f2` | MOBILE |

No extra Phase 5 screens beyond this set. Do not implement in this prompt.

---

## 1. Current Route Map

**Mount:** `src/platform/http/v5FoundationServer.js` → `createPlatformAdminRouter`  
**Route file:** `src/platform/http/platformAdminRoutes.js`  
**Auth (all below unless noted):** apex host (`requireApex`) + `requirePlatformAdmin` (`platform_admin` on `blessboard.user_roles`)  
**CSRF:** all POSTs via `validateCsrf` (`_csrf` + cookie); failures redirect `?error=csrf`  
**Cache:** `Cache-Control: no-store` on admin registration handlers  
**Nav:** `src/platform/http/platformAdminNav.js` → “Registration Applications” → `/admin/registration-applications`

### GET pages

| Method | URL | Handler / service | Template | Purpose |
|--------|-----|-------------------|----------|---------|
| GET | `/admin/registration-applications` | `listRegistrationApplicationsAdmin` | `platform-admin/registration-applications.ejs` | Paginated queue; filters; empty/error states |
| GET | `/admin/registration-applications/:id` | `getRegistrationApplicationDetail` (+ onboarding summary) | `platform-admin/registration-application-detail.ejs` | Monolithic review hub (overview, actions, reject, details, verification, checklist, phone/email, communications, activity, support ops, link org) |
| GET | `/admin/registration-applications/:id/duplicates` | `loadRegistrationDuplicateMatchesForAdmin` | `registration-application-duplicates.ejs` | Duplicate match list (advisory) |
| GET | `/admin/registration-applications/:id/duplicates/:matchId` | `loadRegistrationDuplicateComparisonForAdmin` | `registration-application-duplicate-compare.ejs` | Side-by-side compare + decision form |

### POST actions (registration application)

| Method | URL | Service | Purpose / redirect pattern |
|--------|-----|---------|----------------------------|
| POST | `…/:id/follow-up-status` | `updateRegistrationFollowUpStatus` | Follow-up status; 303 detail `?notice=` / `?error=` |
| POST | `…/:id/assign-support` | `assignRegistrationSupport` | Assign/unassign platform admin |
| POST | `…/:id/contact` | `addRegistrationSupportContact` | Append support contact / note |
| POST | `…/:id/phone-verification/attempts` | `recordPhoneVerificationAttempt` | Append phone verification attempt |
| POST | `…/:id/email-verification/resend` | `resendRegistrationVerificationEmail` | Token + honest delivery status |
| POST | `…/:id/request-information` | `recordInformationRequest` + `updateApplicationSupportFollowUp` | Communications ledger; sets follow-up `awaiting_customer`; **does not** change `application_status` |
| POST | `…/:id/reject` | `rejectRegistrationApplication` | Reject; optional rejection notice; 303 `#reg-rejection` |
| POST | `…/:id/reopen` | `reopenRegistrationApplication` | Rejected → `submitted`; preserves rejection history |
| POST | `…/:id/approve` | `approveAndProvisionRegistrationApplication` | Approve + provision; success → org detail (+ invite cookie) |
| POST | `…/:id/mark-validation-complete` | network validation helper (via admin service) | Network path → ready for provision |
| POST | `…/:id/retry-provision` | same approve/provision orchestrator | Retry failed provision |
| POST | `…/:id/link-organization` | `linkRegistrationApplicationToOrganization` | Soft-link to existing org (no provision) |
| POST | `…/:id/duplicates/:matchId/decision` | `recordDuplicateMatchReviewDecision` | Advisory duplicate decision only (no auto approve/reject/provision) |

### Related (not Phase 5 screens, but post-approval)

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/admin/organizations/:organizationKey` | Post-approve landing; invitation copy-once UI |
| Public GET | `/register/email-verification/:token` | Applicant email verification consume (apex, unauthenticated) |

**Shell / render helpers:** `platformAdminShellLocals.js`, `renderPlatformAdminView`, partials `platform-admin-shell-start/end`.

---

## 2. Current Data Model

### Primary tables

| Table | Role |
|-------|------|
| `blessboard.platform_church_registration_applications` | Application record + status axes + risk/review metadata |
| `blessboard.organization_onboarding` | Post-provision follow-up (1:1 org); may override follow-up display when linked |
| `blessboard.organization_support_contacts` | Append-only contact history (org and/or application scoped) |
| `blessboard.registration_application_support_contacts` / app-level support contact path | Pre-provision CRM notes (via repo helpers) |
| `blessboard.registration_phone_verification_attempts` | Append-only phone verification evidence |
| `blessboard.registration_email_verification_tokens` | Email verification tokens |
| `blessboard.registration_application_communications` | Append-only communications (info request, rejection notice, etc.) |
| Duplicate match ledger (migrations 047+) | Stored scored matches + review decisions |
| `platform.organizations` | Created on approve/provision |
| `blessboard.churches` | Church enrolment for org |
| `blessboard.branches` | First branch created during provision |
| `blessboard.users` / `blessboard.user_roles` | Administrator identity + roles |
| Invitation tables (`user_invitation` / invite repo) | HQ admin invitation on platform-admin approve |
| `platform.audit_events` | Org-scoped audit for approval / follow-up / assignment |
| Application `review_events` JSONB | Append-only review timeline on the application row |

### Important application fields (non-exhaustive)

Identity / submission: `id`, `church_name`, `country`, `city`, `contact_name`, `contact_email`, `contact_phone` (+ normalized), `role_in_church`, `branch_name`, `branch_count`, `selected_plan` (`foundation` \| `growth` \| `network`), `message`, `consent_terms`, legacy `status`.

Lifecycle: `application_status`, `provisioning_status`, `follow_up_status`, `organization_id`, `provisioned_at`, `provisioning_started_at`, `provisioning_failed_at`, `provisioning_error_code`, `provisioning_error_detail`.

Ops: `support_requested`, `assigned_support_user_id`, contact timestamps, `next_follow_up_at`, `review_notes`, risk fields (`risk_decision`, `risk_reason_codes`, …).

Rejection: `rejection_reason`, `rejection_category`, `reapplication_allowed`, `rejection_notification_status`.

---

## 3. Existing Status Model

**Do not invent or rename.** Values below are from repository constants / DB CHECKs.

### Application status (`application_status`)

`submitted` · `duplicate_review` · `rejected` · `cancelled` · `closed`

Legacy column `status` still exists (`pending` \| `contacted` \| `closed`) for older insert/idempotency paths — not the Phase 5 UI vocabulary.

### Provisioning status (`provisioning_status`)

`not_started` · `provisioning` · `provisioned` · `provisioning_failed`

### Follow-up status (`follow_up_status` on applications; expanded vocabulary)

`new` · `contact_pending` · `call_pending` (normalized ↔ `contact_pending` for filters) · `contacted` · `awaiting_customer` · `validation_pending` · `validation_in_progress` · `qualified` · `approved_for_provision` · `needs_help` · `self_onboarding` · `completed` · `unreachable` · `not_interested`

Organization onboarding table historically had a **subset** CHECK; application follow-up was expanded in migration `033`. Prefer application + effective join logic in list/detail queries.

### Organization status (`platform.organizations.status`)

`active` · `inactive` · `retired`

### Church status (`blessboard.churches.status`)

`active` · `inactive` · `suspended` · `archived`

### Branch status (`blessboard.branches.status`)

`active` · `inactive` · `suspended` · `archived`

### Operator display queues (UI labels, not DB enums)

From `registrationOperatorPresenter.js`: All · Needs review · Provisioning failed · Network validation · Ready for approval · Provisioned · Rejected.

### Related allowlists (actions)

- Rejection categories: include `duplicate_registration` and others in `REJECTION_CATEGORIES`
- Communication delivery / rejection notification statuses: honest states including `sending_unavailable`
- Phone verification attempt check statuses / email token statuses: repository allowlists

---

## 4. Existing Approval Flow

Exact sequence for **`POST /admin/registration-applications/:id/approve`**:

1. **Route gate:** `requireApex` + `requirePlatformAdmin` + `validateCsrf`.
2. **Build context:** `actorUserId` from session; optional `organization_key` from body; `deploymentCode` from env; **`dataEnvironment: "testing"` hardcoded in route today**.
3. **Service** `approveAndProvisionRegistrationApplication`:
   - Open owned client; `BEGIN`.
   - `lockApplicationById`.
   - If already `provisioned` + `organization_id` → commit and return `alreadyProvisioned`.
   - Require non-empty `contact_email`.
   - **Network plan:** require follow-up `approved_for_provision` or `qualified`; block rejected/cancelled.
   - **Non-network:** require `application_status` in `submitted` \| `duplicate_review`; block rejected/cancelled/closed.
   - **Failed provision:** retry only when allowed (`allowRetry` + retryable error code; network restrictions apply).
   - Record review event (`approve_provision` / `approve_network_organization` / `retry_provision`); clear rejection reason path as implemented; commit prepare transaction.
4. **Provision** via `provisionRegisteredBlessBoardChurch` with:
   - `administratorViaInvitation: true`
   - `allowRetry: true`
   - `networkOrganizationShell` when network
   - Creates/updates platform org, church, first branch, plan/entitlements, public content scaffolding as orchestrator defines
   - Creates invited administrator identity + HQ invitation (password set on `/invite/accept`) — **not** immediate password activation
5. **On success:** optional `platform.audit_events` (`registration.application_approved` or network variant).
6. **Route response:**
   - Failure → 303 detail `?error=` (`mapApproveError`: csrf already handled; `duplicate_email_review`, `identity_conflict`, `provision_failed`, `not_eligible`, …)
   - Already provisioned → org detail or detail notice
   - Success → **`/admin/organizations/:orgKey?notice=organization_provisioned|network_organization_created#pa-org-invitation`**
   - Sets **copy-once invite cookie** (`setInviteOnceCookie`) when invite link can be built — **not an automated welcome email send**
7. Sync request — no separate async job UI; `provisioning` status may appear briefly in DB during orchestrator, but operator does not get a dedicated “processing” page today.

**Retry** (`POST …/retry-provision`) reuses the same service/orchestrator and similar redirects (`retry_succeeded`).

---

## 5. Current Screen Complexity

Source: `registration-application-detail.ejs` (~2,629 lines) with section nav.

### Essential for approval

- Overview chips / operator status / plan / assignee
- Church + location + contact essentials (who / where / email / phone)
- Recommended next action + Approve / Network approve / Retry forms (CSRF)
- Duplicate signal if `duplicate_review` or strong match risk (link to duplicates)
- Approval checklist / recommendation blockers that gate safe approve
- Clear reject path when not approving

### Useful but secondary

- Verification fact panels
- Phone / email verification workspaces
- Communication log + request-information compose
- Support assignment / contact CRM
- Review activity / audit merge
- Link-organization panel
- Mark validation complete (Network)

### Technical / suitable for hiding (Phase 5)

- Raw UUID / technical failure codes / provisioning error detail dumps
- Dense multi-status chip grids beyond decision need
- Documents section (no backend document store — placeholder risk)
- Deep checklist internals once summary “ready / blocked” is clear
- Full support-ops CRM on the primary decision screen

### Duplicated

- Status shown in overview, recommendation, verification, checklist, and technical panels
- Contact email/phone repeated across applicant, admin, verification, and communications
- Duplicate concern split across recommendation warnings, verification uniqueness, checklist, and separate `/duplicates` screens
- Reject completed state + reopen vs list “Rejected” queue

### Potentially confusing

- Approve succeeds by leaving the application detail for organization detail (no “Church Approved” confirmation screen)
- Request information changes **follow-up** only (`awaiting_customer`), not `application_status`
- Invitation = copy-once link; operators may expect “email sent”
- Network validation path vs Free/Foundation approve path on one page
- Documents section without stored documents
- Simultaneous “Review actions” and large “Rejection workspace”

---

## 6. Stitch-to-Code Gap Matrix

| Stitch screen | Classification | Notes |
|---------------|----------------|-------|
| Church Registrations | **Existing but requires redesign** | List route/view exist; Stitch naming/layout (“Church Registrations”) + simplified filters/cards |
| Church Registrations - Empty State | **Existing and reusable** (light restyle) | Empty state already in list EJS |
| Church Registrations - Mobile | **Existing but requires redesign** | Mobile cards exist; align to Stitch |
| Review Church Registration | **Existing but requires redesign** | Detail hub is functionally rich; Stitch wants decision-focused layout |
| Review Church Registration - Mobile | **Existing but requires redesign** | Same EJS stacked; needs Stitch mobile composition |
| Review … Duplicate Warning (+ Mobile) | **Partially supported** | Data + `/duplicates` + checklist/recommendation warnings; **no** dedicated inline warning review layout matching Stitch |
| Approve Church Confirmation (+ Mobile) | **Missing UI only** | Approve POST exists; confirmation is inline form, not dedicated confirm screen/modal |
| Church Approval Processing | **Missing UI only** | Sync provision; no intermediate processing screen (optional UX shell around same POST) |
| Church Approved (+ Mobile) | **Missing UI only** | Success redirects to organization detail + notice/invite; no dedicated approved screen |
| Request Information (+ Mobile) | **Existing but requires redesign** | POST + compose section on detail; Stitch wants focused screen |
| Information Requested | **Missing UI only** | Flash `notice=information_requested`; no dedicated success screen |
| Church Registration Needs Information (+ Mobile) | **Partially supported** | `awaiting_customer` + operator display “awaiting information”; detail not Stitch “needs info” state page |
| Reject Church Registration (+ Mobile) | **Existing but requires redesign** | Full rejection workspace on detail; extract/focus per Stitch |
| Church Registration Rejected | **Partially supported** | Completed rejection panel on detail; not a distinct Stitch result screen |

**No Stitch screen in this set is blocked by missing core approve/reject/request-info backend.**  
Documents-style content remains **blocked by missing data** if Stitch implies uploads — out of scope for decision workflow unless fields already exist.

---

## 7. Recommended Implementation Boundaries

### Safe to change

- EJS structure/layout for list + detail (simplify, section/order, progressive disclosure)
- `platform-admin.css` scoped classes (bump `?v=` on shell)
- Flash/notice presentation; optional dedicated result views that **still call existing POSTs**
- Confirm step as GET confirm page or client confirm that posts to **existing** `/approve`
- Processing interstitial that submits the same approve POST (no new provisioner)
- Copy/labels (“Church Registrations”) without renaming DB statuses
- Mobile CSS / responsive composition per Stitch mobile screens

### Must remain unchanged

- Apex + `platform_admin` authorization
- CSRF validation on all POSTs
- Status enums and DB CHECKs
- Duplicate review as advisory (no auto merge/reject/approve from match decision)
- Approve eligibility rules (status, network validation, email required, retry gates)
- `provisionRegisteredBlessBoardChurch` transaction / idempotency / invitation mode
- Audit / `review_events` append behavior
- Honest email delivery (`sending_unavailable` must not claim sent)
- Testing / `dataEnvironment` and deployment gates as currently wired
- Existing automated tests’ behavioral contracts (update tests only when UI selectors intentionally change)

### Presentation-only screens

- Empty state, Approved, Information Requested, Approval Processing (shell), Duplicate Warning layout, Needs Information presentation, mobile parity variants

### Likely route changes (additive, prefer reuse)

- Optional GET confirm pages (approve / reject / request-info) posting to **existing** action URLs
- Optional result pages (`?notice=` dedicated views) instead of only org-detail redirect — **preserve** invite cookie behavior if approve success moves

### Service changes

- Prefer **none** for core approve/reject/provision  
- Only presenter/locals tweaks if Stitch needs fewer fields on the decision page  
- Do **not** create parallel approval services

### Migration required?

**No migration genuinely required** for Phase 5 presentation/decision UX. Existing columns and statuses cover the Stitch workflow. Do not add status values or document storage for visual parity alone.

---

## 8. Token-Efficient Implementation Plan

Prefer **2–4 related screens per batch**. Keep POSTs stable; change views/CSS first.

### Batch A — Queue

1. Church Registrations (desktop)  
2. Empty State  
3. Church Registrations - Mobile  

**Touch:** `registration-applications.ejs`, list CSS, nav label if desired.  
**Reuse:** `listRegistrationApplicationsAdmin`, filters, queues.

### Batch B — Decision hub

4. Review Church Registration (desktop)  
5. Review - Mobile  
6. Duplicate Warning (+ mobile as layout variant)  

**Touch:** slim `registration-application-detail.ejs` (or staged partials); keep advanced panels behind secondary links (`/duplicates`, anchors).  
**Reuse:** `getRegistrationApplicationDetail`, checklist/recommendation for gates.

### Batch C — Approve path

7. Approve Confirmation (+ mobile)  
8. Approval Processing  
9. Church Approved (+ mobile)  

**Touch:** confirm UI → existing `/approve`; optional result view; preserve invite cookie + org handoff.  
**No new provisioner.**

### Batch D — Request information

10. Request Information (+ mobile)  
11. Information Requested  
12. Needs Information (+ mobile)  

**Touch:** focused compose/result/state views; existing `/request-information` + `awaiting_customer`.

### Batch E — Reject path

13. Reject Church Registration (+ mobile)  
14. Church Registration Rejected  

**Touch:** focused reject UI; existing `/reject` (+ reopen remains secondary).

### Verification each batch

- CSRF + auth still enforced  
- Existing registration tests still pass (update selectors only when intentional)  
- Compare Cursor Browser vs Stitch desktop **and** mobile  
- Bump `platform-admin.css?v=` when CSS changes

---

## Exact file index (reuse map)

| Concern | Files |
|---------|-------|
| **1. Routes** | `src/platform/http/platformAdminRoutes.js`, `platformAdminNav.js`, `v5FoundationServer.js` |
| **2. Page rendering** | `views/blessboard/v5/platform-admin/registration-applications.ejs`, `registration-application-detail.ejs`, `registration-application-duplicates.ejs`, `registration-application-duplicate-compare.ejs`, `partials/platform-admin-shell-*.ejs`, org detail for post-approve |
| **3. Services** | `registrationApplicationsAdminService.js`, `provisionRegisteredBlessBoardChurch.js`, `provisionBlessBoardChurch.js`, `registrationApplicationCommunicationService.js`, `registrationDuplicateMatchesAdminLoader.js`, `registrationDuplicateReviewDecisionService.js`, `registrationDuplicateMatchQueryService.js`, `registrationDuplicateScoring.js`, `registrationReviewRecommendation.js`, `registrationApprovalChecklist.js`, `registrationVerificationFacts.js`, `registrationOperatorPresenter.js`, `registrationStatusPresentation.js`, `registrationEmailVerificationDelivery.js`, `registrationPhoneVerificationService.js`, `organizationOnboardingAdminService.js` / summary |
| **4. Repositories** | `platformChurchRegistrationRepository.js`, `blessBoardAuthRepository.js`, `userInvitationRepository.js`, `publicContentRepository.js`, platform entitlement/provisioning repos |
| **5. DB / queries** | Migrations `026`, `027`, `028`, `030`, `033`, `036`, `037`, `039`, duplicate-match migrations; queries concentrated in registration repository |
| **6. Approval / provisioning** | `approveAndProvisionRegistrationApplication` → `provisionRegisteredBlessBoardChurch` → `provisionPlatformTenant` / church provision / user+role / invitation |
| **7. Email delivery** | Communications service + email verification delivery (honest unavailable); **admin approve uses invitation copy-once**, not welcome mailer |
| **8. Duplicate checks** | Scoring + match storage + admin loader + decision service + `/duplicates` routes |
| **9. CSS / assets** | `public/blessboard/v5/platform-admin.css` (loaded `?v=50` in shell) |
| **10. Tests** | ~60 `tests/blessboard-registration-*.test.js` + `blessboard-admin-registration-*.test.js` covering list, detail, approve, reject, reopen, info request, duplicates, verification, communications, schema mismatch |

### Prior docs (context, may be partially superseded)

- `docs/FOUNDATION_ADMIN_REGISTRATION_APPLICATIONS_IMPLEMENTATION.md`  
- `docs/phase2/PHASE2_005_ROUTE_MAP.md`  
- `docs/phase2/PHASE2_013_REGISTRATION_DETAIL_GAP_AUDIT.md` (duplicates/verification later completed)  
- `docs/ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md` (early; applications UI since built)

---

## Preserve checklist (Phase 5 must not weaken)

- [ ] Authentication / session  
- [ ] `platform_admin` + apex  
- [ ] CSRF on POSTs  
- [ ] Duplicate review before unsafe provision  
- [ ] Registration validation / eligibility  
- [ ] Provisioning transaction boundaries + idempotency  
- [ ] Audit / review_events history  
- [ ] DB status CHECKs  
- [ ] Testing-environment / deployment gates as currently applied  
- [ ] Honest outbound-email status  

---

*End of PHASE5_001 audit.*
