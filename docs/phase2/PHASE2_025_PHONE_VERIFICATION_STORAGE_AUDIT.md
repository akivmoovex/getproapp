# PHASE2_025 — Phone Verification Storage Audit

**Date:** 2026-07-23  
**Mode (audit):** Documentation only at creation  
**Storage implementation status:** **COMPLETE** (Prompt 026, 2026-07-23) — migration `036_registration_phone_verification_attempts.sql` + repository `createPhoneVerificationAttempt` / `listPhoneVerificationAttempts` + Postgres-gated tests.  
**Service implementation status:** **COMPLETE** (Prompt 027, 2026-07-24) — `src/blessboard/services/registrationPhoneVerificationService.js` (`recordPhoneVerificationAttempt`, `getPhoneVerificationHistory`, `derivePhoneVerificationSummary`) + stub-repo unit tests.  
**Detail-loader status:** **COMPLETE** (Prompt 028, 2026-07-24) — `getRegistrationApplicationDetail` / `loadRegistrationPhoneVerificationForDetail` attach `phoneVerification = { attempts, summary }` with safe unavailable fallback.  
**Read-only UI status:** **COMPLETE** (Prompt 029, 2026-07-24) — `#reg-phone-verification` on registration detail (contact/status summary + call history; empty/unavailable states).  
**Record-attempt POST status:** **COMPLETE** (Prompt 030, 2026-07-24) — `POST /admin/registration-applications/:id/phone-verification/attempts` via `recordPhoneVerificationAttempt`; CSRF + `platform_admin`; redirect notice; **no** separate audit event yet (deferred). **No** discrete verify/fail routes, support-contact writes, verification-fact / recommendation / checklist / approval-gate changes.
**Record call attempt form status:** **COMPLETE** (Prompt 031, 2026-07-24) — expandable “Record call attempt” form on registration detail → existing POST; conservative defaults; allowlisted flash notices.  
**Structured phone → verification facts status:** **COMPLETE** (Prompt 032, 2026-07-24) — `applicant_contacted_by_phone`, `applicant_identity_confirmed`, `applicant_authority_confirmed` from `phoneVerification.summary`; support contacts are display-only, not verification evidence; detail loader order phone → facts → recommendation → checklist.  
**Canonical detail route (today):** `GET /admin/registration-applications/:id`  
**Planned phone workspace (PHASE2_005, not implemented):** `GET /admin/registration-applications/:applicationId/phone-verification`  
**Stitch screens:** Phase2 - 12 Phone Verification (Desktop / Mobile)

---

## Purpose

Determine the smallest safe data model and route design needed later to support:

1. Phone call attempts  
2. Call outcomes  
3. Applicant identity confirmation  
4. Applicant authority confirmation  
5. Phone verification success  
6. Phone verification failure  
7. Follow-up dates  
8. Reviewer notes  
9. Audit history  

No capabilities in this list are implemented in this audit.

---

## Stitch screens under audit

| Screen | Desktop ID | Mobile ID |
|--------|------------|-----------|
| **Phase2 - 12 - Phone Verification** | `a87b0223c25b451ca596ecc95c096820` | `16f868dd262f4f6d94b03f9ecf561936` |

| Field | Value (from `PHASE2_002_STITCH_SCREEN_INVENTORY.md`) |
|-------|--------|
| **Purpose** | Call-based phone verification workspace |
| **Main sections** | Contact facts (phone, WhatsApp, local time); call history; call record form; mandatory checks |
| **Main actions** | Start Verification Call; Record Call Attempt; Open WhatsApp; Mark Phone Verified / Failed |
| **States** | Empty call history possible; outcome select |
| **Responsive** | Form stack |
| **Closest existing** | Support contact log (`organization_support_contacts` with method `phone`) — **PARTIAL**; no verify flag |

**Live Stitch pixel inspection:** UNCONFIRMED in this session (Stitch `get_screen` call failed). Field-level Stitch claims below rely on the inventory + related Phase2 audits, not a fresh screenshot parse.

### Stitch vs current data

| Stitch element | Supported today? | Notes |
|----------------|------------------|-------|
| Applicant phone display | **Yes** | `contact_phone`, `contact_phone_normalized` |
| WhatsApp contact | **No** | No `contact_whatsapp` column (PHASE2_004) |
| Local time | **No** | Not stored; view-only / client-derived at best |
| Call history list | **Yes (detail)** | Prompt 029 `#reg-phone-verification` history; CRM phone contacts remain separate |
| Record call attempt form | **COMPLETE** (Prompt 031) | Expandable form on registration detail → `POST …/phone-verification/attempts` |
| Call outcome select | **Yes (form)** | Verification protocol outcomes (`answered`, `no_answer`, `unavailable`, …) |
| Mandatory identity / authority checks | **Partial** | Structured fields on attempts; checklist/fact wiring still deferred |
| Mark phone verified / failed | **No** | No `phone_verified_*` columns |
| Start Verification Call (telephony) | **Unsupported** | No dialer / softphone integration |
| Open WhatsApp | **View-only aspirational** | `wa.me` link possible from phone digits; not a stored channel |
| Desktop | Form + history side-by-side (inventory) | UNCONFIRMED layout details |
| Mobile | Form stack (inventory) | UNCONFIRMED layout details |

---

## Evidence separation (do not conflate)

| Concept | Meaning | Current evidence |
|---------|---------|------------------|
| **Call attempted** | Administrator recorded an outbound/inbound phone interaction attempt | Partial: support contact `contact_method='phone'` |
| **Call answered** | Party answered the call | Partial / ambiguous: outcome `reached` is CRM language, not protocol |
| **Applicant contacted** | Applicant (or designated contact) was reached | Partial: same support-contact log |
| **Applicant identity confirmed** | Administrator confirmed the person is the named applicant | **Unsupported** — free-text notes unsafe as proof |
| **Applicant authority confirmed** | Administrator confirmed authority to administer the church | **Unsupported** — `consent_terms` ≠ authority |
| **Phone ownership verified** | Administrator concluded the number belongs to / reaches the applicant under verification policy | **Unsupported** |
| **Verification failed** | Explicit negative verification decision | **Unsupported** |
| **Follow-up required** | Further contact scheduled or ops status requires follow-up | Partial: `next_follow_up_at`, `follow_up_status` |

### How facts should be sourced later

| Fact / claim | Derive from call attempts | Store explicitly | Audit event | Leave unsupported |
|--------------|---------------------------|------------------|-------------|-------------------|
| Call attempted | **Yes** (attempt rows) | Attempt row itself | Record attempt | — |
| Call answered | From attempt `outcome` | On attempt | Optional | — |
| Applicant contacted | From attempt outcome ∈ answered family | On attempt | Optional | — |
| Identity confirmed | **No** (must not infer from “answered”) | Explicit three-state on attempt and/or rollup | Yes on change | Until storage exists |
| Authority confirmed | **No** (must not infer from terms or call) | Explicit three-state | Yes on change | Until storage exists |
| Phone ownership verified | From latest `verification_result=verified` | Explicit result + timestamp | Yes | Until storage exists |
| Verification failed | From `verification_result=failed` | Explicit result + reason | Yes | Until storage exists |
| Follow-up required | From `follow_up_at` / app follow-up | Attempt + app rollup OK | When scheduled | — |
| Phone uniqueness | **Separate** — existing risk / occupancy | Existing normalized phone | Existing risk path | Do not mix into verification attempts |

Phone uniqueness (`phone_unique_registration_scope`) remains a **registration-scope occupancy** check and must stay separate from ownership verification.

---

## Current storage candidates

### 1. `blessboard.platform_church_registration_applications`

| Attribute | Finding |
|-----------|---------|
| **Columns (phone-related)** | `contact_phone`, `contact_phone_normalized`; follow-up: `follow_up_status`, `first_contacted_at`, `last_contacted_at`, `next_follow_up_at`, `assigned_support_user_id`, `support_requested`; notes: `review_notes`; risk: `risk_decision`, `risk_reason_codes`, `risk_decided_at`; JSONB: `review_events` |
| **Missing for Stitch verify** | No `phone_verified_at`, `phone_verification_status`, identity/authority confirm flags |
| **Repository / service** | `platformChurchRegistrationRepository` getters/updaters; `getRegistrationApplicationDetail`; risk evaluate |
| **Routes** | Detail GET; follow-up / assign / approve / reject / contact (indirect) |
| **Append-only?** | No — mutable row; `review_events` is append-style JSONB array |
| **Administrator identity** | Via `review_events[].actor_user_id`, assign columns — not per phone verify |
| **Timestamps** | Yes (`created_at`, contact dates, risk decided) |
| **Phone vs email** | Phone columns only for number; contacts elsewhere |
| **Identity / authority confirm** | No |
| **Verification failure** | No |
| **Follow-up dates** | Yes (`next_follow_up_at`) |
| **Ambiguity risk** | High if free-text `review_notes` used as “verified” |
| **Mark** | **REUSE_WITH_EXTENSION** for **rollup only** (status/timestamp after structured attempts exist); **UNSAFE_OR_AMBIGUOUS** as sole verification store |

### 2. `blessboard.organization_support_contacts`

| Attribute | Finding |
|-----------|---------|
| **Columns** | `id`, `organization_id` (nullable after 033), `registration_application_id`, `created_by_user_id`, `contact_method`, `outcome`, `note`, `contacted_at`, `next_follow_up_at`, `created_at` |
| **Method / outcome allowlists** | Methods: `phone`, `email`, `message`, `meeting`, `internal_note`. Outcomes: `reached`, `no_answer`, `left_message`, `scheduled`, `declined`, `completed`, `other` |
| **Repository** | `createOrganizationSupportContact`, `listOrganizationSupportContacts`, `listApplicationSupportContacts` |
| **Service** | `addRegistrationSupportContact` |
| **Routes** | `POST /admin/registration-applications/:id/contact` (`requireApex` + `requirePlatformAdmin` + CSRF) |
| **Append-only?** | **Yes** (insert-only history; no update API in repo) |
| **Administrator** | `created_by_user_id` required |
| **Timestamps** | `contacted_at`, `created_at`; optional `next_follow_up_at` |
| **Phone vs email** | Yes via `contact_method` |
| **Identity / authority** | **No** structured fields — only free-text `note` |
| **Verification failure** | **No** |
| **Follow-up** | Per-row `next_follow_up_at` + app/onboarding rollup |
| **Ambiguity risk** | **High** — operational CRM log; `reached` ≠ identity confirmed; used for email/meeting/notes too |
| **Mark** | **REUSE_DIRECTLY** for **generic call/contact logging** and follow-up notes; **UNSAFE_OR_AMBIGUOUS** as phone-ownership / identity / authority evidence |

### 3. Application vs organization support-contact scoping

| Attribute | Finding |
|-----------|---------|
| **Behavior** | Unprovisioned Network/support apps write application-scoped contacts (`organization_id` null). Provisioned apps write org-scoped contacts linked to application id. |
| **Ambiguity** | Same table serves onboarding CRM and registration ops |
| **Mark** | **REUSE_DIRECTLY** for ops contact history; not verification protocol |

### 4. `blessboard.organization_onboarding` follow-up fields

| Attribute | Finding |
|-----------|---------|
| **Columns** | `follow_up_status`, contact dates, `assigned_support_user_id`, `support_requested`, etc. |
| **Use** | Mirror for provisioned orgs; detail merges effective follow-up from onboarding vs application |
| **Phone verification** | None |
| **Mark** | **NOT_APPLICABLE** for verification evidence; **REUSE_DIRECTLY** for post-provision ops follow-up only |

### 5. Risk / review records on the application

| Attribute | Finding |
|-----------|---------|
| **Columns** | `risk_decision`, `risk_reason_codes`, `risk_decided_at`, `review_events` JSONB, `rejection_reason` |
| **Service** | `evaluateRegistrationRisk`, reject/approve review events |
| **Phone** | Risk may include `duplicate_phone` — uniqueness, not ownership verify |
| **Mark** | **REUSE_DIRECTLY** for uniqueness / risk snapshot; **UNSAFE_OR_AMBIGUOUS** for verification success/failure |

### 6. Platform audit log (`recordAuditEventSafe` / organization audit events)

| Attribute | Finding |
|-----------|---------|
| **Usage today** | Org-scoped `registration.support_contact_added` (note body omitted); registration approve/reject paths |
| **Application-scoped contacts** | Often only `review_events` on the application (no org audit when unprovisioned) |
| **Identity / verify** | No dedicated action keys |
| **Mark** | **REUSE_WITH_EXTENSION** for future verify action keys; not a primary evidence store |

### 7. `review_notes` / generic notes

| Attribute | Finding |
|-----------|---------|
| **Columns** | Application `review_notes`; support contact `note` / `internal_note` |
| **Mark** | **UNSAFE_OR_AMBIGUOUS** for structured verification claims; **REUSE_DIRECTLY** for free-text reviewer commentary alongside structured fields |

### 8. JSONB metadata on the application (`review_events`, `network_validation_checklist`)

| Attribute | Finding |
|-----------|---------|
| **Queryability** | Weak for call history / filtering |
| **Audit quality** | Events exist but not a call-attempt ledger |
| **Mark** | **UNSAFE_OR_AMBIGUOUS** as primary call-attempt store; **REUSE_WITH_EXTENSION** for lightweight state-change breadcrumbs only |

---

## Data model options

### A. Reuse existing support-contact records unchanged

| Criterion | Assessment |
|-----------|------------|
| Queryability | Good for “phone contacts”; poor for verification semantics |
| Audit quality | Append-only inserts; notes omitted from org audit metadata |
| Migration complexity | None |
| Ambiguous evidence | **High** |
| Compatibility | Excellent |
| Call history | Yes (CRM history) |
| Derive verification facts | **Cannot** honestly derive identity/authority/verified |
| Maintainability | Leaves Phase2 Stitch blocked |
| **Verdict** | Insufficient for Stitch verification |

### B. Extend support-contact records with structured verification fields

| Criterion | Assessment |
|-----------|------------|
| Queryability | Medium — mixed CRM + verification rows |
| Audit quality | Better if columns added; still mixes purposes |
| Migration complexity | Medium (ALTER + new CHECKs; outcome vocabulary conflict) |
| Ambiguous evidence | **Medium–high** — every phone contact looks like a verification attempt |
| Compatibility | Touches shared onboarding contact table |
| Call history | Yes |
| Derive facts | Possible but noisy |
| Maintainability | Couples CRM ops to verification protocol |
| **Verdict** | Possible short-cut; not preferred |

### C. Create one normalized registration phone-verification-attempt table

| Criterion | Assessment |
|-----------|------------|
| Queryability | **Best** for attempt history and latest result |
| Audit quality | **Best** — one row per structured attempt |
| Migration complexity | One focused migration |
| Ambiguous evidence | **Lowest** if CRM contacts remain separate |
| Compatibility | Additive; existing contact POST unchanged |
| Call history | Yes (dedicated) |
| Derive facts | Clear mapping to facts / checklist |
| Maintainability | **Best** long-term |
| **Verdict** | **Recommended** |

### D. Store structured JSONB on the application

| Criterion | Assessment |
|-----------|------------|
| Queryability | Poor for history lists / indexes |
| Audit quality | Weaker than normalized rows |
| Migration complexity | Low |
| Ambiguous evidence | Medium (easy to overwrite / hard to validate) |
| Compatibility | Easy to bolt on |
| Call history | Awkward |
| Derive facts | Possible but fragile |
| Maintainability | Weak for multi-attempt protocol |
| **Verdict** | Reject as primary store |

### Recommendation

**Recommend option C** — one normalized child table for phone verification attempts.

Optionally add **small application rollup columns** later (or in the same migration if product wants O(1) checklist reads):

- `phone_verification_status` (`pending` \| `verified` \| `failed`)  
- `phone_verified_at` / `phone_verification_failed_at`  

Those rollups are **derived projections** of the latest decisive attempt, not a substitute for attempt history. Prefer writing them in the same service transaction as the attempt insert to avoid dual-write drift.

Keep `organization_support_contacts` for general CRM phone/email/meeting/notes. Do **not** treat CRM `reached` as identity or ownership verification.

---

## Proposed record (option C)

### Table (proposed name)

`blessboard.registration_phone_verification_attempts`

### Minimum fields

| Field | Type (proposed) | Required | Purpose |
|-------|-----------------|----------|---------|
| `id` | UUID PK | Yes | Identity |
| `application_id` | UUID FK → applications | Yes | Scope |
| `phone_number_called` | TEXT | Yes | Display / as dialed |
| `phone_number_normalized` | TEXT | Yes when normalize ok; else reject insert | Align with uniqueness helper |
| `contact_person_name` | TEXT NULL | No | Who answered (Stitch contact facts) |
| `contact_person_role` | TEXT NULL | No | Role claimed on call |
| `attempted_at` | TIMESTAMPTZ | Yes | When call occurred |
| `outcome` | TEXT | Yes | Call outcome allowlist |
| `applicant_identity_status` | TEXT | Yes | Three-state confirmation |
| `applicant_authority_status` | TEXT | Yes | Three-state confirmation |
| `verification_result` | TEXT | Yes | `pending` / `verified` / `failed` |
| `verification_reason` | TEXT NULL | When failed (recommended) | Why failed |
| `notes` | TEXT | Yes (bounded) | Reviewer notes for the attempt |
| `follow_up_at` | TIMESTAMPTZ NULL | No | Next follow-up from this attempt |
| `created_by_user_id` | UUID FK → users | Yes | Administrator |
| `created_at` | TIMESTAMPTZ | Yes | Insert time |

### Explicitly excluded from minimum (unless Stitch re-confirms)

| Field | Reason |
|-------|--------|
| `church_details_confirmed` | UNCONFIRMED as a distinct Stitch control; avoid inventing |
| `additional_documents_required` | Documents unsupported in registration today |
| `updated_at` | Prefer append-only attempts; no in-place edits |
| Softphone / WhatsApp provider ids | Unsupported integrations |
| Raw call recordings / SIP payloads | Out of scope |

### Three-state confirmations (avoid boolean `false` = not checked)

| Value | Meaning |
|-------|---------|
| `not_checked` | Administrator did not assert a yes/no on this attempt |
| `confirmed` | Explicit positive confirmation |
| `not_confirmed` | Explicit negative (could not confirm / denied) |

Apply to:

- `applicant_identity_status`
- `applicant_authority_status`

### Call outcome allowlist (proposed)

- `answered`
- `no_answer`
- `unavailable`
- `wrong_number`
- `callback_requested`
- `information_inconsistent`

Do **not** overload existing CRM outcomes (`reached`, `completed`, …) onto this table.

### Verification result allowlist (proposed)

- `pending` — attempt logged; ownership not decided  
- `verified` — ownership verified under policy  
- `failed` — ownership verification failed  

**Rule:** `verification_result=verified` must require `applicant_identity_status=confirmed` (and product may also require authority confirmed). Exact gate is implementation-time policy — UNCONFIRMED whether authority is mandatory for “Mark Phone Verified” in Stitch.

---

## Route design (do not implement now)

Prefer the existing detail route family. Keep CRM `POST …/contact` unchanged for generic contacts.

### Recommended minimal set

#### 1. GET workspace (already planned in PHASE2_005)

| Field | Value |
|-------|--------|
| **Path** | `GET /admin/registration-applications/:id/phone-verification` |
| **Middleware** | `requireApex` + `requirePlatformAdmin` |
| **Permission** | All `platform_admin` today |
| **CSRF** | N/A |
| **Service** | New presenter: application + attempts list + current rollup |
| **Repository** | `getRegistrationApplicationById`; `listPhoneVerificationAttemptsByApplicationId` |
| **Audit** | None (read) |
| **Redirect** | Missing app → list/detail |

#### 2. Record call attempt (preferred single write action)

| Field | Value |
|-------|--------|
| **Path** | `POST /admin/registration-applications/:id/phone-verification/attempts` |
| **Middleware** | `requireApex` + `requirePlatformAdmin` |
| **Permission** | All `platform_admin` (logical: `pa.registration.phone_log`) |
| **CSRF** | Required |
| **Validation** | UUID; outcome allowlist; three-state statuses; verification_result allowlist; note length; phone normalize via `normalizeRegistrationPhone`; follow_up_at optional ISO |
| **Service** | `recordRegistrationPhoneVerificationAttempt` |
| **Repository** | Insert attempt; optionally update application rollup columns in same TX |
| **Audit** | `registration.phone_verification_attempt_recorded` (+ verify/fail keys when result decisive) |
| **Redirect** | 303 → phone-verification GET `?notice=call_recorded` |

One record-call action **may** set `verification_result` to `verified` / `failed` when the form includes those fields and validation passes — avoiding a second round-trip when safe.

#### 3. Mark verified (only if separate confirm UX is required)

| Field | Value |
|-------|--------|
| **Path** | `POST /admin/registration-applications/:id/phone-verification/verify` |
| **Middleware** | Same |
| **Permission** | Same role today; treat as sensitive (confirm + reason) |
| **CSRF** | Required |
| **Validation** | Confirm checkbox; optional reason; require prior attempt or inline fields |
| **Service** | `markRegistrationPhoneVerified` |
| **Repository** | Insert decisive attempt **or** update rollup from latest attempt — prefer **new attempt row** with `verification_result=verified` for auditability |
| **Audit** | `registration.phone_verified` with previous/new status |
| **Redirect** | Phone-verification GET `?notice=phone_verified` |

#### 4. Mark failed

| Field | Value |
|-------|--------|
| **Path** | `POST /admin/registration-applications/:id/phone-verification/fail` |
| **Middleware** | Same |
| **Permission** | Same |
| **CSRF** | Required |
| **Validation** | Reason required |
| **Service** | `markRegistrationPhoneVerificationFailed` |
| **Repository** | Insert attempt with `verification_result=failed` + reason; update rollup |
| **Audit** | `registration.phone_verification_failed` |
| **Redirect** | Phone-verification GET `?notice=phone_verification_failed` |

**Prefer:** ship GET + record-attempt first; add discrete verify/fail POSTs only if Stitch’s “Mark Verified / Failed” cannot share the attempt form safely.

---

## Permissions

| Action | Today | Logical future key | Fine-grained needed now? |
|--------|-------|--------------------|--------------------------|
| View phone workspace | Any `platform_admin` | `pa.registration.view` | **No** |
| Record call attempt | Any `platform_admin` via contact | `pa.registration.phone_log` | **No** |
| Mark verified | Missing | `pa.registration.phone_verify` | **Not yet** — same role; require confirm + audit |
| Mark failed | Missing | `pa.registration.phone_verify` | **Not yet** |
| View full attempt notes | Any admin who can open detail | `pa.registration.view` | **No** — notes already visible on support contacts |

Do **not** introduce a new permission framework in the next batch. Document sensitivity via confirm UI + audit only (aligned with PHASE2_007).

---

## Phone normalization helper to reuse

| Item | Value |
|------|--------|
| **Helper** | `normalizeRegistrationPhone` |
| **File** | `src/blessboard/services/normalizeRegistrationPhone.js` |
| **Input** | Raw phone string + optional country |
| **Output** | `{ ok: true, display, normalized }` E.164 `+…` or `{ ok: false, error, field: "phone" }` |
| **Country assumptions** | Modest `COUNTRY_CALLING_CODES` map (includes `zm` / `zambia` → `260`); unknown country requires explicit `+` international form |
| **Display preserved?** | Yes — original trimmed display returned separately from normalized |
| **Duplicate checks** | Risk / unique index use `contact_phone_normalized` occupancy SQL |
| **Zambia / international risks** | National numbers without `+` need recognized country; ambiguous formats rejected; failed normalize → no uniqueness protection |
| **Recommendation** | **Reuse** for attempt `phone_number_normalized`; store `phone_number_called` as display/as-dialed; default called number from application contact phone |

---

## Audit requirements

| Event | When | Identify |
|-------|------|----------|
| `registration.phone_verification_attempt_recorded` | Every attempt insert | Application; admin; timestamp; outcome; verification_result; attempt id; previous/new rollup status |
| `registration.phone_verified` | Result becomes verified | Application; admin; timestamp; previous status; new status; attempt id; reason optional |
| `registration.phone_verification_failed` | Result becomes failed | Application; admin; timestamp; previous/new; reason; attempt id |
| `registration.phone_verification_follow_up_scheduled` | `follow_up_at` set/changed on attempt or app | Application; admin; timestamp; follow_up_at |
| `registration.phone_verification_state_changed` | Optional umbrella when rollup changes | Previous/new status; related attempt |

**Notes policy:** Follow existing support-contact pattern — store full notes on the attempt row; put `note_len` / reason codes in audit metadata; **do not** dump full note text into generic audit metadata unless policy changes.

Unprovisioned applications may lack org-scoped audit rows today — prefer application `review_events` breadcrumb **plus** platform audit when `organization_id` exists (same pattern as contacts).

---

## Verification fact / recommendation / checklist integration

| Consumer | Effect of future storage |
|----------|--------------------------|
| `applicant_contacted_by_phone` | **COMPLETE** (032) — `passed` when summary `applicantContacted`; support contacts do not count |
| `applicant_identity_confirmed` | **COMPLETE** (032) — newest explicit `confirmed` / `not_confirmed`; later `not_checked` ignored; never from CRM `reached` alone |
| `applicant_authority_confirmed` | **COMPLETE** (032) — newest explicit authority status; terms alone remain insufficient |
| Phone uniqueness | Unchanged — separate fact |
| Advisory recommendation | Soft signal: verified may reduce “phone contact ≠ identity” manual reasons; failed/inconsistent outcomes may increase manual / info-required — **still advisory** |
| Approval checklist | `applicant_called`, identity, authority items can leave `not_available` / terms-only states once attempts exist — **still advisory; no gate change in this design** |

Do not change those services in this audit.

---

## Recommended next implementation

**Single smallest batch:** Option C migration + repository methods + focused tests.

### Exact scope

| Item | Detail | Status |
|------|--------|--------|
| **Create** | `db/migrations/blessboard/036_registration_phone_verification_attempts.sql` | **COMPLETE** (026) |
| **Create / extend** | `createPhoneVerificationAttempt`, `listPhoneVerificationAttempts` on `platformChurchRegistrationRepository.js` | **COMPLETE** (026) |
| **Service** | `registrationPhoneVerificationService.js` — record / history / summary | **COMPLETE** (027) |
| **Detail loader** | `loadRegistrationPhoneVerificationForDetail` → `phoneVerification` on detail | **COMPLETE** (028) |
| **Read-only UI** | `#reg-phone-verification` summary + call history on registration detail | **COMPLETE** (029) |
| **Record attempt POST** | `POST …/phone-verification/attempts` → `recordPhoneVerificationAttempt` | **COMPLETE** (030) |
| **Record call attempt form** | Expandable form on registration detail → existing attempts POST | **COMPLETE** (031) |
| **Phone evidence → verification facts** | Contacted / identity / authority from summary; uniqueness unchanged | **COMPLETE** (032) |
| **Optional same migration** | Application rollup columns — deferred (not essential for first storage batch) | Deferred |
| **Tests** | Storage (Postgres-gated); service stub-repo; detail loader; phone UI; attempt route; record form; facts phone-evidence | **COMPLETE** (026–032) |
| **Docs touch** | PHASE2_005 / 006 / 008 Batch 10; 015; 022; this audit | **COMPLETE** |

### Explicit exclusions for that batch

- No GET/POST routes  
- No EJS / CSS  
- No changes to `addRegistrationSupportContact` semantics  
- No approval-gate changes  
- No email verification  
- No duplicate scoring  
- No WhatsApp/telephony providers  
- No fact/recommendation/checklist service wiring yet (follow-up batch after storage lands)

### Why this batch

It creates reliable, queryable, non-ambiguous evidence without blocking on UI. UI and fact wiring become thin consumers afterward.

---

## Confirmation

**Audit (025):** documentation only at creation.  
**Storage (026):** migration + repository + tests landed.  
**Service (027):** business rules + summary landed.  
**Detail loader (028):** history + summary on registration detail landed.  
**Read-only UI (029):** detail phone section landed.  
**Record-attempt POST (030):** route landed; audit-event integration deferred; **no** discrete verify/fail routes, support-contact writes, verification-fact / recommendation / checklist / approval behavior changes.

**Record call attempt form (031):** EJS form on registration detail complete; posts to existing attempts route only; **no** route/service/repository/migration, verification-fact, recommendation, checklist, or approval-gate changes.

**Structured phone → verification facts (032):** facts consume `phoneVerification` summary once per detail load; support-contact notes no longer count as verification evidence; recommendation/checklist recalculate from updated facts only; **no** routes, EJS, writes, or approval-gate changes.
