# PHASE2_022 — Approval Checklist Rules

**Date:** 2026-07-23  
**Service:** `src/blessboard/services/registrationApprovalChecklist.js`  
**Detail loader:** `loadRegistrationApprovalChecklistForDetail` in `registrationApplicationsAdminService.js` (Prompt 023)  
**View-model property:** `approvalChecklist` on `getRegistrationApplicationDetail` result  
**Mode:** Deterministic, read-only, advisory only  
**Inputs:** `verification`, optional `reviewRecommendation` (context only)

---

## Purpose

Derive a Phase2 **approval requirements checklist** from canonical verification facts so operators can see what is complete, incomplete, limited-scope, unsupported, or still needing manual judgment.

Detail load (023) calls the checklist service **once** per successful detail request, using the server-generated `verification` and `reviewRecommendation`, and attaches `approvalChecklist` alongside them. It does not persist the checklist and does not change approval gates.

This service does **not**:

- Change approval or provisioning gates
- Persist checklist completion
- Write audits or workflow events
- Accept client-controlled checklist values
- Return `readyForApproval`
- Invent email verification, phone verification, or duplicate scores

`advisory: true` on every result.

### Detail loader safe failure (023)

If checklist calculation throws:

- Log with `[registration-approval-checklist]` (message only; no raw stack to clients)
- Return advisory fallback with all ten items
- Use `not_available` or `manual_review_required` only (no `complete`)
- Set `requiredOutstanding` conservatively to all required items
- Keep the detail page available (`verification`, `reviewRecommendation`, and application data unchanged)
- Do **not** suppress failure of the main application loader

**Loader status:** **COMPLETE** (023).  
**UI status:** **COMPLETE** (024) — read-only `#reg-approval-checklist` on `registration-application-detail.ejs` (summary strip, item cards, Advisory notice, safe local anchors only). No mark-complete/override/approve-from-checklist actions. Approval gate unchanged.

---

## Output shape

| Field | Type | Notes |
|-------|------|--------|
| `items` | array | Fixed order; one entry per checklist key |
| `summary` | object | Counts below |
| `calculatedAt` | ISO string | Tracks `now`; only non-deterministic field for identical inputs |
| `advisory` | `true` | Always |

### Item fields

| Field | Notes |
|-------|--------|
| `key` | Stable checklist key |
| `label` | Operator-facing label |
| `status` | `complete` · `incomplete` · `warning` · `not_available` · `manual_review_required` |
| `explanation` | Honest, non-raw text |
| `sourceFactKeys` | Fact keys used |
| `supported` | Whether underlying evidence capability exists |
| `required` | Checklist required flag (all current items are required) |
| `actionTarget` | Existing page anchor or `null` |

### Summary counts

| Field | Meaning |
|-------|---------|
| `total` | Item count |
| `complete` | Status `complete` |
| `incomplete` | Status `incomplete` |
| `warning` | Status `warning` |
| `notAvailable` | Status `not_available` |
| `manualReviewRequired` | Status `manual_review_required` |
| `requiredComplete` | Required items with status `complete` |
| `requiredOutstanding` | Required items not `complete` |

**Not returned:** `readyForApproval`.

---

## Item derivation rules

### 1. `applicant_email_verified`

| Evidence | Status |
|----------|--------|
| Fact unsupported / missing | `not_available` |
| Fact `passed` (canonical status `verified`) | `complete` |
| Fact `warning` (`expired` / `unavailable`) | `warning` |
| Fact `not_checked` (`sent` / `not_sent` / `replaced`) | `incomplete` |

Email uniqueness and email delivery are **not** ownership verification. Sent/expired are **not** complete.

`actionTarget`: `#reg-email-verification` when the ownership item is supported.

### 2. `phone_uniqueness_reviewed`

| Fact `phone_unique_registration_scope` | Status |
|----------------------------------------|--------|
| `passed` | `complete` (registration-scope only; explanation states the limit) |
| `failed` (duplicate phone) | `incomplete` |
| `warning` | `warning` |
| `not_checked` / no live lookup | `warning` |

### 3. `email_uniqueness_reviewed`

| Fact `email_unique_platform_users_only` | Status |
|----------------------------------------|--------|
| `passed` (platform users only) | `warning` — partial scope is **not** fully complete |
| `warning` | `warning` |
| missing email / no live lookup | `incomplete` |

### 4. `duplicate_results_reviewed`

| Evidence | Status |
|----------|--------|
| `duplicate_review_evidence` manually reviewed / `different_church_reviewed` / `matches_reviewed` / admin action recorded | `complete` (evidence preserved on ledger) |
| `confirmed_duplicate` or `impersonation_concern` | `manual_review_required` (high-risk; no auto-reject) |
| Warning hold, matches awaiting review, or risk duplicate signals | `manual_review_required` |
| Church-name match alone without review evidence | `manual_review_required` (name alone insufficient) |
| Strong identifier without completing review decision | `manual_review_required` |
| No review evidence | `incomplete` |

Source facts: `duplicate_review_evidence`, `church_name_exact_match`, `strong_duplicate_identifier` (Prompt 054).

`reviewRecommendation` may only add context to the explanation (e.g. elevated duplicate risk). It must not become the checklist status.

### 5. `applicant_called`

| Fact `applicant_contacted_by_phone` | Status |
|-------------------------------------|--------|
| Structured answered call (`passed` / `structured_applicant_contacted`) | `complete` |
| Legacy phone contact logged (`manually_reviewed` / `phone_contact_logged`) | `complete` (compat) |
| History unavailable (`warning`) | `manual_review_required` |
| No structured answered call | `incomplete` |

A planned follow-up is **not** a completed call. Generic support-contact notes are **not** structured verification evidence.

### 6. `applicant_identity_confirmed`

| Evidence | Status |
|----------|--------|
| Fact `passed` (explicit identity confirmed on attempts) | `complete` |
| Fact `failed` (explicit not confirmed) | `incomplete` |
| Fact `warning` (phone history unavailable) | `manual_review_required` |
| Fact `not_checked` | `incomplete` |
| Fact unsupported | `not_available` |

Phone contact / answered call alone is **insufficient**.

### 7. `applicant_authority_confirmed`

| Evidence | Status |
|----------|--------|
| Fact `applicant_authority_confirmed` `passed` | `complete` |
| Fact `applicant_authority_confirmed` `failed` | `incomplete` |
| Fact `applicant_authority_confirmed` `warning` | `manual_review_required` |
| Terms accepted only (authority still not checked) | `manual_review_required` |
| Terms missing | `incomplete` |

Do **not** mark complete without independent authority evidence. Terms remain separate supporting context.

### 8. `required_fields_complete`

| Fact `required_fields_complete` | Status |
|---------------------------------|--------|
| `passed` | `complete` |
| `failed` | `incomplete` |

### 9. `website_or_organization_key_confirmed`

| Fact `organization_key_available` | Status |
|-----------------------------------|--------|
| `passed` | `complete` |
| `not_checked` / not stored | `warning` (availability deferred to approve/provision) |
| `failed` (e.g. reserved key) | `incomplete` |

A separate website-key result is **not** invented (`distinct_website_key_available` remains unsupported context only).

### 10. `final_reviewer_note_entered`

| Fact `final_reviewer_note_present` | Status |
|------------------------------------|--------|
| `review_notes_present` | `complete` |
| `contact_note_present` only | `incomplete` (general support notes do not count) |
| Absent | `incomplete` |

---

## Current unsupported evidence

| Checklist item | Why |
|----------------|-----|
| *(none for email ownership)* | `applicant_email_verified` is supported from canonical email-verification status (Prompt 042) |

`applicant_identity_confirmed` is supported from structured phone-verification attempts (Prompt 032).

Remaining unsupported facts (documents / distinct website key) are outside this checklist item set or remain `not_available` only when their source fact is unsupported.

---

## Partial-scope limitations

| Item | Limitation |
|------|------------|
| Phone uniqueness | Registration applications only |
| Email uniqueness | Platform users only; never “fully complete” from that scope alone |
| Organization / website key | Organization key only; no distinct website key |
| Authority | Terms ≠ authority |
| Called | Contact log ≠ identity |

---

## Action targets

Safe existing anchors used when applicable:

- `#reg-verification`
- `#reg-administration`
- `#reg-website`
- `#reg-email-verification`

`null` when no valid on-page target exists (e.g. `#reg-contact` / `#reg-review-activity` are not present on the detail page today). Do not invent routes.

---

## Recommendation relationship

`reviewRecommendation` is optional context only. Checklist statuses remain fact-derived and explainable. The recommendation code is never copied into item status.

---

## Approval behavior unchanged

| Concern | Status |
|---------|--------|
| Approve / reject / provision | Unchanged |
| Checklist persistence | None |
| Database writes / migrations | None |
| Detail view-model property | `approvalChecklist` (loader 023) |
| Detail UI | `#reg-approval-checklist` advisory panel (024); Approve/Reject unchanged |
| Client-controlled checklist | Rejected |
| `readyForApproval` | Not returned |

Operators may still approve under existing Foundation / Growth / Network rules regardless of this advisory checklist.

---

## Determinism

Same `verification` (+ optional recommendation context) and fixed `now` → identical result except `calculatedAt`. Input objects are not mutated.
