# PHASE2_015 — Verification Facts Gap Audit

**Date:** 2026-07-23  
**Mode:** Documentation only — **no runtime code, tests, migrations, routes, views, CSS, JavaScript, or Stitch screens were modified**  
**Canonical detail route (today):** `GET /admin/registration-applications/:id`  
**Planned verification route (PHASE2_005, not implemented):** `GET /admin/registration-applications/:applicationId/verification`  
**Primary services inspected:** `getRegistrationApplicationDetail`, `approveAndProvisionRegistrationApplication`, `evaluateRegistrationRisk`, `normalizeRegistrationPhone`, `platformChurchRegistrationValidation`, `provisionRegisteredBlessBoardChurch`  
**Primary repositories:** `platformChurchRegistrationRepository`, `blessBoardAuthRepository`  
**Stitch screens:** Phase2 - 10 Registration Verification; Phase2 - 11 Approval Requirements Checklist

---

## Stitch screens under audit

| Screen | Desktop ID | Mobile ID |
|--------|------------|-----------|
| **Phase2 - 10 - Registration Verification** | `8d5c641aa91642edb4c56971e3979a13` | `f12f1db130644e9a8be20362cfd6cdfa` |
| **Phase2 - 11 - Approval Requirements Checklist** | `3f33fc25e51b459dabec4f68d14a50f3` | `454da5192ce54c0da779df62126ed697` |

Stitch Verification expects check rows (name duplicate, phone uniqueness, email uniqueness, email verification, website domain, applicant authority), overall recommendation, pass/warn/fail/checking.  
Stitch Checklist expects mandatory items, final reviewer note, gated Approve.  
**Closest live data:** persisted `risk_decision` / `risk_reason_codes` / `risk_decided_at`, application statuses, support contacts, Network follow-up statuses — **no** dedicated verification workspace and **no** email/phone verified columns.

**Allowed display statuses for a future read-only facts UI (do not persist in this audit):**  
`not_checked` · `checking` · `passed` · `warning` · `failed` · `manually_reviewed` · `overridden`

---

## Fact matrix

| # | Fact key | User-facing label | Canonical source | Table / column / service | Value type | Derivable now | Reliable pass/fail | Manual review | Last-checked timestamp | Audit evidence | Recommended Phase2 status | Admin explanation (honest) | Missing backend capability |
|---|----------|-------------------|------------------|--------------------------|------------|---------------|--------------------|---------------|------------------------|----------------|---------------|----------------------------|----------------------------|
| 1 | `applicant_email_verified` | Applicant email verified | Email verification tokens | Canonical `emailVerification.status` from `registration_email_verification_tokens` (via detail loader) | status enum | **yes** (042) | **yes** for ownership when `verified` | Required when not verified | Token `verified_at` / `expires_at` | Token ledger | `passed` only when `verified`; `not_checked` for `sent`/`not_sent`/`replaced`; `warning` for `expired`/`unavailable` | Sent/expired are **not** verified. Email uniqueness remains a separate fact. | Real SMTP/ESP (delivery); change-email / manual-verify later |
| 2 | `applicant_email_unique` | Applicant email unique | Risk + auth | `evaluateRegistrationRisk` → `authRepo.findUserByEmail`; code `duplicate_email` | boolean signal + reason code | **partial** | **partial** | Yes when `duplicate_email` or provision `duplicate_email_review` | `risk_decided_at` for snapshot only | `risk_reason_codes`, provision path | `warning` if code present; else `not_checked` (do not invent `passed`) | Checks whether a platform **user** already has this email. Does not prove uniqueness across all pending applications or org contacts unless re-queried. | Pending-app email uniqueness query; org/branch contact scan |
| 3 | `applicant_phone_unique` | Applicant phone unique | Risk + unique index | `contact_phone_normalized`; `findOccupyingPhoneMatch`; unique index on active phones | normalized E.164 string + reason `duplicate_phone` | **yes** (against registration apps) | **yes** for registration-app occupancy | Optional if conflicting formats suspected | `risk_decided_at` or live re-query | Risk codes; DB unique constraint | Live re-query → `passed`/`failed`; stale snapshot alone → prefer re-check | Phone uniqueness uses normalized E.164 among open/in-flight applications and provisioned/provisioning rows. Not checked against platform users, orgs, churches, branches, or support contacts. | Broader uniqueness scopes if product requires |
| 4 | `similar_church_name_found` / `church_name_exact_match` | Similar church name found | Risk + match ledger | Live exact triple lookup **or** canonical match signals `exact_church_name` / `exact_name_city_country` (054) | reason / signals | **yes** | **yes** for exact; **no** fuzzy | Yes | Match `updated_at` / live | Risk codes; match ledger | `warning` if name signal; never strong-identifier failure from name alone | Exact name (+ city/country when available). Not a fuzzy score. Name alone → manual review, not high duplicate risk. | Fuzzy name matching (explicitly deferred) |
| 5 | `strong_duplicate_identifier` / `strong_duplicate_identifier_found` | Strong duplicate identifier found | Match ledger | High-weight signals: registration number, phone overlap, church-owned email, website domain; risk levels `strong`/`confirmed` (054) | signals + risk_level | **yes** (054) | **yes** for stored strong signals | Yes | Match timestamps | `registration_duplicate_matches` | `failed` for phone/reg-number/confirmed; `warning` for other strong exact ids; name-only → not strong | Strongest automated signals from canonical scoring. Does **not** auto-reject. | — |
| 6 | `duplicate_results_reviewed` / `duplicate_review_evidence` | Duplicate results reviewed | Match ledger decisions | Allowlisted `review_decision` on `registration_duplicate_matches` (+ legacy review_events fallback) | decision enum | **yes** (054) | **yes** for structured decisions | **Yes** | `reviewed_at` | Match ledger; `review_events` | `manually_reviewed` for `different_church` / completing decisions (evidence preserved); `failed` for `confirmed_duplicate` / `impersonation_concern`; else warning/incomplete | Holding in duplicate review is not enough; per-match decisions are canonical. No auto approve/reject. | — |
| 7 | `applicant_contacted_by_phone` | Applicant contacted by phone | Structured phone attempts | `phoneVerification.summary.applicantContacted` (answered outcomes) | summary | **yes** (032) | **yes** for contact | Informational | Attempt `attempted_at` | Phone attempt ledger | `passed` when answered; `not_checked` with no attempts; `warning` if history unavailable | Support-contact phone notes are **not** verification evidence | — |
| 8 | `applicant_identity_confirmed` | Applicant identity confirmed | Structured phone attempts | Newest explicit `applicant_identity_status` (`confirmed` / `not_confirmed`); ignore later `not_checked` | attempt fields | **yes** (032) | **yes** | Required | Attempt timestamps | Phone attempt ledger | `passed` / `failed` / `not_checked` / `warning` (unavailable) | Do not infer from answered call, uniqueness, name match, or notes | — |
| 9 | `applicant_authority_confirmed` | Applicant authority confirmed | Structured phone attempts (+ terms separate) | Newest explicit `applicant_authority_status`; `authority_terms_accepted` remains a separate fact | attempt fields | **yes** (032) | **yes** for authority | Required for Stitch meaning | Attempt timestamps | Phone attempt ledger | `passed` / `failed` / `not_checked` / `warning`; terms alone never confirm authority | Terms/privacy acceptance is supporting context only | — |
| 10 | `required_registration_fields_complete` | Required registration fields complete | Validation + row | Public validation required set stored on app | completeness | **yes** | **yes** for stored required set | No if all present | None dedicated (use `created_at`) | Row columns | `passed` if all required stored fields non-empty; else `failed` | Completeness of fields required at public submission (see Required fields). | — |
| 11 | `requested_organization_key_available` | Requested organization key available | Instant path / approve override | Not stored on application by default; optional on approve body; reserved-key risk | string / null | **partial** | **partial** | Yes when key requested | Risk `reserved_organization_key` at submit | Risk code; provisioner uniqueness | `not_checked` if no stored requested key; live check when key supplied | Canonical identifier is **organization key**. Separate “website key” does not exist. Availability is checked at provision / reserved-key risk, not as a durable application column. | Optional `requested_organization_key` column |
| 12 | `requested_website_key_available` | Requested website key available | Same as org key | No distinct website/slug column on application | — | **no** (as separate fact) | **no** | — | — | — | Omit or alias to org-key fact with explanation | System uses organization key / public org routing — not a separate website-key check. | Do not invent website-key fact |
| 13 | `requested_plan_eligible` | Requested plan eligible | Validation + allowlists | `selected_plan` ∈ foundation/growth/network | enum | **yes** | **yes** | No | — | Row | `passed`/`failed` | Plan must be an allowlisted public registration plan. | — |
| 14 | `registration_documents_complete` | Registration documents complete | — | No document store | — | **no** | **no** | — | — | — | `not_checked` + unsupported copy | No registration documents are stored or linked. | Document child table / media FK |
| 15 | `final_reviewer_note_entered` | Final reviewer note entered | Notes / contacts | `review_notes` loaded in SQL but **not mapped** to detail presenter; contact notes optional | text | **partial** | **no** as checklist gate | Optional | Contact `created_at` | Contacts; unmapped `review_notes` | `not_checked` unless mapped note/contact exists | No mandatory final reviewer note gate exists today. | Map `review_notes` and/or require note policy |
| 16 | `application_linked_to_organization` | Application linked to an existing organization | Org FK | `organization_id` / `organization_key` | uuid / key | **yes** | **yes** | No | Org `created_at` / link events | Link POST; audits | `passed` if linked; else `not_checked`/`failed` per UX | Linked when `organization_id` is set (provision or link-organization). | — |
| 17 | `provisioning_prerequisites_satisfied` | Provisioning prerequisites satisfied | Approve + provisioner | Admin gates + orchestrator | derived | **partial** | **yes** for known gates | Yes for Network validation | Event timestamps | Approve eligibility flags | Derive from current approve rules (below) | Reflects **current backend** gates, not Stitch verification completeness. | Verification-gated approve (Batch 9 — later) |
| 18 | `existing_risk_decision` | Existing risk decision | Risk columns | `risk_decision`, `risk_reason_codes`, `risk_decided_at` | enum + codes[] + timestamptz | **yes** | **yes** as snapshot | Interpreting codes | **`risk_decided_at`** | Persist on insert/update | Present decision; do not auto-map to invented verification % | Snapshot from public risk evaluation (and admin reject updates). Re-run may differ. | Optional run-checks POST later |
| 19 | `support_or_follow_up_required` | Support or follow-up requirement | Flags / plan | `support_requested`, Network plan, `follow_up_status` | bool + status | **yes** | **yes** for “required vs not” | Ops judgment | Contact / follow-up timestamps | Onboarding/app fields | `warning` if Network/support; else informational | Network and support-requested applications use follow-up ops; Foundation/Growth may still be held by risk. | — |
| 20 | `approval_eligible_under_current_rules` | Eligible for approval under current backend rules | Admin service flags + approve function | `riskReviewActionsAvailable` / `networkApproveAvailable` + `approveAndProvisionRegistrationApplication` | boolean | **yes** | **yes** for **current** rules | Operator still decides | — | UI flags; service checks | `passed`/`failed` from eligibility only | Eligibility does **not** require email verification, phone verification, documents, or checklist completion. | Future checklist gate (explicit Batch 9) |

---

## Email verification — what “confirmed” means today

| Question | Finding |
|----------|---------|
| **Source field** | Canonical status from `blessboard.registration_email_verification_tokens` (not a denormalized column on the application row) |
| **Confirmation timestamp** | Token `verified_at` when status is `verified` |
| **Token / confirmation mechanism** | Hash-only magic-link tokens; public consume route (041); admin resend (039–040) |
| **Confirms email ownership?** | **Yes** when status is `verified` — wired into `applicant_email_verified` (Prompt 042). `sent` / `expired` / `not_sent` / `replaced` are **not** treated as verified |
| **Applies to applicant or user account?** | Registration applicant `contact_email` ownership. Separate from platform user invite/password flows |
| **Acknowledgement / delivery** | Outbound SMTP/ESP still unavailable; delivery claims must not be invented. Token status may still be `sent` when recorded |
| **Case normalization** | **Yes** for registration: `validateEmail` lowercases. Platform users: `normalizeEmail` / `email_normalized` |
| **Uniqueness vs pending applications** | **Not** a dedicated uniqueness constraint on `contact_email`. Risk does **not** flag another pending app with the same email (except soft phone+email idempotency) |
| **Uniqueness vs platform users** | **Yes** — `duplicate_email` when `findUserByEmail` hits; also provision can enter `duplicate_email_review`. Uniqueness fact stays separate from ownership |
| **Uniqueness vs organization / church / branch contacts** | **Not** part of registration risk evaluation |
| **Safe display** | Ownership fact from canonical status only. Email uniqueness may be `warning` from stored `duplicate_email` or live user lookup — **never** invent uniqueness `passed` without a live uniqueness query documented as limited scope |

---

## Phone uniqueness

| Scope | Safely checkable today? | Notes |
|-------|-------------------------|-------|
| Pending / open registration applications | **Yes** | Occupancy: `submitted`/`duplicate_review` **or** provisioning in `provisioning`/`provisioned`/`provisioning_failed` via `contact_phone_normalized` |
| Existing platform users | **No** (registration risk) | Not queried in `evaluateRegistrationRisk` |
| Organizations / churches / branches | **No** | Not in registration phone uniqueness |
| Support contacts | **No** | Contact log only |

**Normalization:** `normalizeRegistrationPhone` prefers E.164 when country calling code is known; ambiguous values rejected. Differently formatted same numbers that normalize identically are treated as one. Numbers that fail to normalize never get uniqueness protection. Same email + same phone on retry is treated as soft idempotency, not a conflict.

**Unique index:** Active-registration phone uniqueness enforced in DB (migration 028) — aligns with occupancy rules.

---

## Phone verification evidence

| Claim | Proven by current data? | Notes |
|-------|-------------------------|-------|
| Call attempted | **Partial** | Support contact with `contact_method='phone'` implies a logged phone contact — not a structured “call attempt” model |
| Applicant answered | **No** | Outcomes (`reached`, `no_answer`, …) are free allowlisted outcomes, not verification protocol |
| Identity confirmed | **No** | |
| Authority confirmed | **No** | |
| Phone verification failed | **No** | No verify/fail status columns |
| Follow-up required | **Partial** | `follow_up_status`, `next_follow_up_at`, support flags |

**Distinction:** Support-contact notes are **administrator operational logs**, not structured verification evidence. Do not treat `reached` as identity confirmation.

---

## Duplicate review capabilities

| Capability | Support |
|------------|---------|
| Exact phone overlap | **Yes** — risk + unique index |
| Exact email overlap (platform user) | **Yes** — `duplicate_email` / provision review |
| Exact email overlap (other applications) | **Partial / weak** — not a first-class risk code |
| Existing organization link | **Yes** — `organization_id` / link-organization |
| Current risk decision | **Yes** — persisted snapshot |
| Manual duplicate review | **Partial** — `duplicate_review` status + human approve/reject/link; no per-match decisions |
| Similar-name comparison | **Exact name+city+country only** — not fuzzy scoring |

Do **not** design a future scoring algorithm in this audit.

---

## Required fields

### Required at public submission

(`platformChurchRegistrationValidation.validatePlatformChurchRegistration`)

- `church_name`, `country`, `city`
- `contact_name` (or `full_name`)
- `role_in_church`
- email, phone (normalizable)
- `selected_plan` (foundation / growth / network)
- consent (`consent_contact` / `consent_terms`)
- honeypot must not fire

Optional: `branch_name`, `branch_count`, `message`.

### Required for instant provision path (additional)

- Valid `organization_key` (+ password per instant rules — not a Phase2 admin verification fact)

### Required before manual approval (current backend)

- Valid application UUID; actor platform admin
- Non-empty `contact_email`
- Foundation/Growth: `application_status` ∈ `submitted` \| `duplicate_review`; not rejected/cancelled/closed; not already provisioned; Network excluded from `riskReviewActionsAvailable`
- Network: `follow_up_status` ∈ `approved_for_provision` \| `qualified`; not rejected/cancelled
- Retry path: retryable provisioning failure codes for Foundation/Growth only

**Not required today:** email verified, phone verified, documents, final reviewer note, verification checklist completion.

### Required before provisioning (orchestrator)

- Application eligible; administrator email; organization key available (requested or generated); email not colliding into hard provision failure / `duplicate_email_review` paths as implemented

### Optional in Stitch but not stored

Legal name, denomination, tax/RC, street address, website URL, separate proposed admin, documents, multi-consent / authority letter, verification scores.

---

## URL / key availability

| Identifier | Exists on registration? | Notes |
|------------|-------------------------|-------|
| **Organization key** | Canonical | Validated by `validateRequestedOrganizationKey`; reserved keys → risk `reserved_organization_key`; uniqueness at provision / `findOrganizationIdByKey` |
| Church key | Post-provision tenant concept | Not an application verification field |
| Public path / domain | Post-provision publication | Not stored on application |
| Requested slug / website key | **No separate field** | Do **not** invent a separate website-key check |

**Normalization:** organization key validation rules in `platformChurchRegistrationValidation` / `organizationKey` helpers.

---

## Approval eligibility gate (current)

| Topic | Behavior |
|-------|----------|
| **Existing checks** | Status/plan/follow-up gates above; contact email present; optional org key validation; Network validation follow-up; retry allowlist for failed provisioning |
| **Override behavior** | Optional `organization_key` override on approve/retry/link; Network “mark validation complete” sets follow-up toward approval; **no** verification-override API |
| **Approve without verification?** | **Yes** — no email/phone verification gate |
| **Approve directly provisions?** | **Yes** for Foundation/Growth (and Network shell create) via `provisionRegisteredBlessBoardChurch` with admin invitation |
| **Risk decision effect** | Informational on detail; `duplicate_review` remains **approvable** for Foundation/Growth; reject writes `risk_decision=reject` + `ADMIN_REJECTED` |
| **Duplicate-review status effect** | Holds auto-provision; **does not** block admin approve for Foundation/Growth |
| **Email confirmation effect** | **None** on approve eligibility |

UI flags: `riskReviewActionsAvailable`, `networkApproveAvailable`, `markValidationCompleteAvailable`, `retryProvisionAvailable`, `rejectActionsAvailable` (computed in `getRegistrationApplicationDetail`).

---

## Recommended architecture — smallest read-only verification-facts service

| Item | Recommendation |
|------|----------------|
| **Proposed file** | `src/blessboard/services/registrationVerificationFacts.js` |
| **Inputs** | `{ application }` detail-mapped object **or** application id + db; optional `{ recheck: boolean }` later |
| **Output shape** | `{ applicationId, generatedAt, facts: Fact[], riskSnapshot, eligibility }` where each `Fact` = `{ key, label, status, reliable, explanation, evidence?, checkedAt?, unsupported?: boolean }` |
| **Reuse** | `registrationRiskDecision` helpers (`findOccupyingPhoneMatch`, `findSimilarOrganizationMatch`, `reasonLabelsForAdmin`, `RISK_*`); `authRepo.findUserByEmail`; detail fields already on application; support contacts list for phone-contact informational fact |
| **Additional query?** | **One optional parallel re-check package** (phone occupancy + similar name + user email) when rendering verification — **or** status from persisted risk only with explicit “snapshot at risk_decided_at; may be stale” explanations. Prefer **persisted snapshot first** for Batch 7 smallest; add live re-check in same service behind a flag if tests need reliability |
| **Unknown / unsupported** | `status: 'not_checked'`, `unsupported: true`, `reliable: false`, honest explanation — **never** `passed` |
| **Explanations** | Static allowlisted strings per fact key + interpolate stored reason labels only |
| **Timestamps** | Expose `risk_decided_at`, contact `contacted_at`, `generatedAt`; never invent check times |
| **Avoid fabricating passed** | Default unset facts to `not_checked`; only emit `passed`/`failed`/`warning` when a documented rule and evidence exist |

**Migration:** **Not required** for the smallest read-only facts batch. Migrations remain deferred for email/phone verified columns, documents, and duplicate decision tables.

---

## Counts (for completion report)

| Bucket | Fact keys |
|--------|-----------|
| **Reliably derivable now** | `applicant_phone_unique` (registration scope), `similar_church_name_found` / `church_name_exact_match` (exact), `strong_duplicate_identifier` (054 match ledger), `duplicate_results_reviewed` / `duplicate_review_evidence` (054 decisions), `required_registration_fields_complete`, `requested_plan_eligible`, `application_linked_to_organization`, `existing_risk_decision` / `risk_decision_present`, `support_or_follow_up_required`, `approval_eligible_under_current_rules` |
| **Partially derivable** | `applicant_email_unique`, `requested_organization_key_available`, `provisioning_prerequisites_satisfied`, `final_reviewer_note_entered` |
| **Supported via phone attempts (032)** | `applicant_contacted_by_phone`, `applicant_identity_confirmed`, `applicant_authority_confirmed` (terms remain separate via `authority_terms_accepted`) |
| **Supported via email tokens (042)** | `applicant_email_verified` (canonical status only; uniqueness separate) |
| **Supported via duplicate matches (054)** | `church_name_exact_match`, `strong_duplicate_identifier`, `duplicate_review_evidence`, `risk_decision_present` (enriched with match decisions) |
| **Unsupported** | `registration_documents_complete`, `requested_website_key_available` (as distinct fact) |

---

## Recommended next implementation

**One smallest batch:** Phase2 **Batch 7 read-only verification-facts service**

### Status — **COMPLETE** (2026-07-23, Prompts 016–018; phone evidence 032; email ownership 042; duplicate evidence 054 on 2026-07-24)

Implemented:

- `src/blessboard/services/registrationVerificationFacts.js` — `buildRegistrationVerificationFacts`
- Detail loader integration: phone → email → duplicate matches → facts → recommendation → checklist (status/matches loaded once each)
- Read-only Verification UI on `registration-application-detail.ejs` (`#reg-verification`): summary counts, fact cards, shared status chips, advisory notice
- Structured phone evidence (032): `applicant_contacted_by_phone`, `applicant_identity_confirmed`, `applicant_authority_confirmed` from attempt summary; support contacts no longer count as verification evidence
- Email ownership (042): `applicant_email_verified` from canonical email-verification status; sent/expired not treated as verified; approval gate unchanged
- Duplicate evidence (054): `church_name_exact_match`, `strong_duplicate_identifier`, `duplicate_review_evidence`, `risk_decision_present` from `registration_duplicate_matches`; recommendation + checklist recalculated; **no** auto approve/reject
- Tests: facts, loader, phone-evidence facts, email-ownership facts, duplicate-evidence facts, UI

Still deferred: dedicated verification route, run-checks, overrides, approval checklist gating, real SMTP/ESP, change-email/manual-verify, working verification actions.

### Explicit exclusions (unchanged)

- Migrations / verified_at columns  
- Verification overrides / writes  
- Email resend / change-email  
- Duplicate scoring / fuzzy match  
- Approval behavior changes / checklist gating (Batch 9 gate)  
- Document uploads  
- Invented evidence  
- V4 changes  

---

## Runtime change confirmation

**Prompt 015:** docs only. **016:** facts service. **017:** detail loader. **018:** read-only Verification UI only (no verification writes, no approval-gate changes).
