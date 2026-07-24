# PHASE2_046 — Duplicate Scoring Rules

**Date:** 2026-07-24  
**Service:** `src/blessboard/services/registrationDuplicateScoring.js`  
**Normalization:** `registrationDuplicateNormalization.js` (Prompt 044)  
**Storage:** `blessboard.registration_duplicate_matches` (Prompt 047) — persist `score` + `risk_level` + `evidence_snapshot`; review decisions allowlisted separately  
**Query service:** `registrationDuplicateMatchQueryService.js` (Prompt 048) — loads candidates, scores, stores, lists/compares  
**Mode:** Deterministic, read-only scoring; storage is write-capable for matches/decisions only  
**Tests:** `tests/blessboard-registration-duplicate-scoring.test.js` (unit); storage Postgres-gated in `blessboard-registration-duplicate-match-storage.test.js`; query stubbed + Postgres-gated (`blessboard-registration-duplicate-match-query*.test.js`)

---

## Purpose

Score a **subject registration** against a **candidate** (application, organization, or platform user) with explainable risk levels.

This service does **not**:

- Query the database
- Automatically merge organizations
- Automatically reject applications
- Change approval or provisioning gates
- Invent fuzzy name scores or ESP delivery claims
- Emit `confirmed` from field overlap alone

---

## Risk levels

| Level | Meaning |
|-------|---------|
| `none` | No meaningful overlap, or administrator already marked **different** |
| `possible` | Limited / weak overlap (name similarity, same town, platform-user email, etc.) |
| `strong` | High-weight exact signals without canonical manual confirmation |
| `confirmed` | **Only** when canonical **manual** evidence already exists (link / admin same-duplicate) |

---

## Output shape

| Field | Type | Notes |
|-------|------|--------|
| `riskLevel` | string | One of the levels above |
| `totalWeight` | number | Sum of signal weights (explainable band, not ML confidence) |
| `reasons` | `{ code, weight, message }[]` | Human-readable; every fired signal |
| `signals` | `string[]` | Reason codes |
| `explanation` | string | Operator summary; states advisory / no auto merge-reject |
| `subjectId` / `candidateId` | string\|null | Pass-through ids |
| `candidateType` | string | `application` \| `organization` \| `user` \| … |
| `advisory` | `true` | Always |
| `autoMerge` | `false` | Always |
| `autoReject` | `false` | Always |
| `approvalGateUnchanged` | `true` | Always |
| `calculatedAt` | ISO string | Only non-deterministic field for identical inputs |

Batch helper: `scoreRegistrationDuplicateMatches` sorts `confirmed` → `strong` → `possible` → `none`, then by `totalWeight` desc.

---

## Signal weights

| Code | Weight | Band intent |
|------|-------:|-------------|
| `exact_registration_number` | 80 | High → typically `strong` alone |
| `verified_phone_overlap` | 75 | High — same E.164 **and** `phoneVerified` on subject or candidate |
| `church_owned_email` | 75 | High — subject email ∈ candidate `churchOwnedEmails` / `primaryEmail` |
| `exact_phone_overlap` | 55 | High — same E.164 without verified flag (occupying phone) |
| `exact_website_domain` | 40 | High enough for `strong` alone when domains match |
| `exact_name_city_country` | 20 | **Limited** — exact triple; not `strong` alone |
| `platform_user_email` | 18 | Limited — existing user account; **not** ownership |
| `same_contact_email` | 18 | Limited — another application contact email |
| `exact_church_name` | 12 | **Limited** — name only |
| `same_city_country` | 8 | **Weak** — same town + country |
| `same_city_only` | 4 | **Weak** — city alone |
| `canonical_manual_evidence` | 0 | Annotation when level is `confirmed` |

**Thresholds:** `possible` if total weight ≥ 8 (or any weak reason below that floor); `strong` if total weight ≥ 40 and not manually confirmed/different.

---

## Level resolution order

1. **Admin marked different** → `none` (even if field overlap is strong)  
2. **Canonical manual confirmation** (`linkedSameOrganization`, admin same-duplicate, allowlisted review action) → `confirmed`  
3. **Weight ≥ 40** → `strong`  
4. **Weight ≥ 8** or remaining weak reasons → `possible`  
5. Else → `none`

`confirmed` is **never** derived from registration number, phone, email, name, town, or domain overlap alone.

---

## Manual evidence (canonical)

Accepted shapes on `manualEvidence`:

| Field / action | Effect |
|----------------|--------|
| `linkedSameOrganization: true` | `confirmed` |
| `adminMarkedSameDuplicate: true` / `confirmedDuplicate: true` | `confirmed` |
| `action` ∈ `link_organization`, `same`, `same_organization`, `duplicate_marked_same`, `confirm_duplicate` | `confirmed` |
| `adminMarkedDifferentDuplicate: true` / `action` ∈ `different`, `not_duplicate`, `duplicate_marked_different` | `none` |

Batch: `manualEvidenceByCandidateId[id]` overrides per candidate.

---

## Explicit non-goals

- No automatic merge  
- No automatic rejection  
- No approval-gate changes  
- No fuzzy / phonetic / Levenshtein name scoring  
- No inventing registration numbers or domains  
- No treating platform-user email as church-owned or ownership-verified  
- No treating same town alone as `strong` or `confirmed`

---

## False-positive posture

| Situation | Expected level |
|-----------|----------------|
| Same city + country, different names | `possible` (weak) |
| Exact church name, different city | `possible` (limited) |
| Exact name + city + country only | `possible` (limited) |
| Platform user email only | `possible` |
| Same phone, verified | `strong` (not `confirmed`) |
| Same registration number | `strong` (not `confirmed`) |
| Link-organization already recorded | `confirmed` |
| Admin marked different | `none` |

---

## Persistence mapping (Prompt 047)

| Scoring field | Storage column |
|---------------|----------------|
| `totalWeight` | `score` (integer) |
| `riskLevel` | `risk_level` (`none`/`possible`/`strong`/`confirmed`) |
| `reasons` / `signals` / `explanation` | `evidence_snapshot` JSONB object only |
| Manual review outcome | `review_decision` + `review_reason` + `reviewed_by_user_id` + `reviewed_at` |

Review decisions on the ledger are **not** the same as scoring `confirmed` (which requires prior canonical manual evidence input). Recording `confirmed_duplicate` on a row is an operator decision and does not auto-merge or change approval gates.

---

## Verification consumption (Prompt 054)

Stored matches and decisions feed read-only verification facts on registration detail:

| Fact | Rule |
|------|------|
| `church_name_exact_match` | Name signals → **warning** only (never strong-identifier failure) |
| `strong_duplicate_identifier` | High-weight exact signals / `strong`/`confirmed` levels → **failed** or **warning**; name alone does not qualify |
| `duplicate_review_evidence` | `different_church` (and other completing decisions) → `manually_reviewed` while preserving ledger evidence; `confirmed_duplicate` / `impersonation_concern` → high-risk `failed` |
| `risk_decision_present` | Enriched when high-risk match decisions conflict with a stored `allow` |

Recommendation (`PHASE2_019`) and checklist (`PHASE2_022`) recalculate from these facts. **No** automatic approval or rejection.

---

## Related documents

- `PHASE2_043_DUPLICATE_DATA_AUDIT.md` — tables / indexes / signal inventory + match storage  
- `PHASE2_044` normalization helpers (in 043 + `registrationDuplicateNormalization.js`)  
- `PHASE2_015_VERIFICATION_FACTS_GAP_AUDIT.md` — facts matrix; duplicate evidence wired (054)  
- `PHASE2_019_RECOMMENDATION_RULES.md` — advisory recommendation consumes strong-identifier + match decisions; does not invent scores  
- `PHASE2_022_APPROVAL_CHECKLIST_RULES.md` — duplicate checklist item from canonical decisions  
- `PHASE2_008_IMPLEMENTATION_PLAN.md` — Batch 12–13 + 054 wiring  
