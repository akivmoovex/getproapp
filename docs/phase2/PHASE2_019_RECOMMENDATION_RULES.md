# PHASE2_019 — Recommendation Rules

**Date:** 2026-07-23  
**Service:** `src/blessboard/services/registrationReviewRecommendation.js`  
**Detail loader:** `loadRegistrationReviewRecommendationForDetail` in `registrationApplicationsAdminService.js` (Prompt 020)  
**View-model property:** `reviewRecommendation` on `getRegistrationApplicationDetail` result  
**Input:** `verification = { facts, summary, checkedAt }` from `registrationVerificationFacts` (or equivalent)  
**Mode:** Deterministic, read-only, advisory only

---

## Purpose

Produce an operator-facing **advisory** recommendation from existing verification facts.

Detail load (020) calls the recommendation service **once** per successful detail request and attaches `reviewRecommendation` alongside existing `verification`. It does not rename `verification`, does not persist the recommendation, and does not change approval gates.

This service does **not**:

- Change approval or provisioning gates
- Persist recommendations
- Write audits
- Perform database lookups
- Accept client-controlled recommendation status
- Invent duplicate scores
- Treat unsupported checks as automatic failures

### Detail loader safe failure (020)

If recommendation calculation throws:

- Log with `[registration-review-recommendation]` (message only; no raw stack to clients)
- Return advisory fallback: `manual_review_required` / tone `warn` / `advisory: true`
- Keep the detail page available (`verification` and application data unchanged)
- Do **not** suppress failure of the main application loader

**Loader status:** **COMPLETE** (020).  
**UI status:** **COMPLETE** (021) — read-only `#reg-recommendation` panel on `registration-application-detail.ejs` (label, tone, Advisory chip, explanation, counts, reasons, verification anchor). No accept/override/approve-from-recommendation actions.

---

## Output shape

| Field | Type | Notes |
|-------|------|--------|
| `code` | string | One of the codes below |
| `label` | string | Operator-facing label |
| `tone` | string | Presentation tone (`ok` / `warn` / `danger`) |
| `explanation` | string | Concise summary; always states advisory / gate unchanged |
| `reasons` | `{ factKey, status, message }[]` | Structured; no raw errors/objects |
| `blockingFacts` | `string[]` | Fact keys that drove blocking codes |
| `warningFacts` | `string[]` | Supported warning fact keys |
| `calculatedAt` | ISO string | Only non-deterministic field for identical inputs |
| `advisory` | `true` | Always |

---

## Allowed codes and tones

| Priority | Code | Tone |
|----------|------|------|
| 1 | `not_eligible` | `danger` |
| 2 | `high_duplicate_risk` | `danger` |
| 3 | `additional_information_required` | `warn` |
| 4 | `manual_review_required` | `warn` |
| 5 | `recommended_for_approval` | `ok` |

Rules are evaluated in that order. The first matching rule wins.

---

## Exact conditions

### 1. `not_eligible`

Return only when **supported** canonical facts clearly show ineligibility:

- `requested_plan_eligible` status `failed`
- `required_fields_complete` status `failed`
- `approval_eligible_current_rules` status `failed`

**Do not** classify unsupported checks (email verified, identity confirmed, documents, distinct website key) as ineligible.

### 2. `high_duplicate_risk`

Return when supported evidence shows a **strong** duplicate concern:

- `phone_unique_registration_scope` status `failed`
- `strong_duplicate_identifier` status `failed` or `warning` (exact identifiers / strong band — **not** name alone)
- `risk_decision_present` result `reject`, or high-risk duplicate decision conflict (`allow_with_high_risk_duplicate_decision`, `high_risk_duplicate_decision_without_risk_snapshot`)
- `duplicate_review_evidence` with `confirmed_duplicate` or `impersonation_concern`, or warning with result `held_for_duplicate_review`
- Organization already linked (`organization_linked` passed) while duplicate-review evidence remains active (`held_for_duplicate_review`, `risk_duplicate_signals`, or `matches_awaiting_review`)

**Do not:**

- Use similar / exact church name alone (`church_name_exact_match` warning → manual review)
- Invent a duplicate score
- Treat platform-user email overlap alone as high duplicate risk
- Auto-approve or auto-reject from match decisions

**Canonical source (054):** `registration_duplicate_matches` via detail loader `listDuplicateMatches` → verification facts.

### 3. `additional_information_required`

Return when supported facts show the applicant must provide or clarify information:

- `provisioning_prerequisites_current_rules` failed with applicant-data-missing results (e.g. `administrator_email_required`)
- Explicit follow-up result `applicant_action_required` (when present)
- `authority_terms_accepted` failed (terms missing), if not already covered by eligibility

**Do not** treat unsupported document or email-verification checks as automatic applicant failures.

### 4. `manual_review_required`

Return when:

- Any supported fact has `warning` status
- Any non-eligibility supported fact has `failed` status (e.g. Network provisioning gate)
- Phone contact exists (`applicant_contacted_by_phone` = `manually_reviewed`) but identity is not confirmed
- Duplicate review evidence is incomplete (`duplicate_review_evidence` = `not_checked`)
- Email uniqueness was not confirmed live (`email_unique_platform_users_only` = `not_checked`)
- Organization-key availability is not fully confirmed (`organization_key_available` = `not_checked`)
- Important checks remain unsupported **and** critical eligibility facts are not all passed, **or** other manual signals already exist

Unsupported checks produce **manual review**, not failure / `not_eligible`.

Null or malformed verification input also returns safe `manual_review_required`.

### 5. `recommended_for_approval`

Return only when:

- No supported fact has `failed`
- No high duplicate-risk condition exists
- No applicant information is currently required
- All supported critical eligibility facts pass (`required_fields_complete`, `requested_plan_eligible`, `approval_eligible_current_rules`)
- No supported warnings or other manual signals from step 4
- Remaining unsupported facts (if any) are clearly listed as **limitations** in the explanation

The explanation always states that this is an **advisory** recommendation and **does not change** the current approval gate.

---

## Why unsupported checks do not become failures

Unsupported facts (`applicant_email_verified`, `applicant_identity_confirmed`, `registration_documents_complete`, `distinct_website_key_available`) are always `supported: false` / `not_checked` in the facts service because the backend does not store those capabilities yet.

Treating them as `failed` or `not_eligible` would invent a verification gate that does not exist in current approval logic. Phase2 therefore:

- Never maps unsupported → `not_eligible` / automatic applicant failure
- Uses them as manual-review reasons when other review signals exist or critical facts are incomplete
- Lists them as limitations when an advisory `recommended_for_approval` is otherwise warranted

---

## Approval behavior unchanged

| Concern | Status |
|---------|--------|
| Approve / reject / provision routes | Unchanged |
| `approveAndProvisionRegistrationApplication` eligibility | Unchanged |
| Database writes / migrations | None from this service |
| Recommendation persistence | None |
| Detail view-model property | `reviewRecommendation` (loader 020) |
| Detail UI | `#reg-recommendation` advisory panel (021); Approve/Reject unchanged |
| Client-controlled recommendation | Rejected (input is facts only; query/body ignored) |
| Email / phone verification workflows | Not added |
| Duplicate scoring | Consumed indirectly via stored match ledger facts (054); recommendation still does not invent scores |

Operators may still approve under existing Foundation / Growth / Network rules regardless of this advisory code.

---

## Determinism

Given the same `verification.facts` (and fixed `now`), the result is identical except `calculatedAt` tracks `now`. The service does not mutate the input object.
