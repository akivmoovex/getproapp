# V2.04 — Shared Person Duplicate / Match Engine

## Phase 2 Implementation Report

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_DUPLICATE_ENGINE_REPORT` |
| **Phase** | 2 — DUPLICATE DETECTION |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **Prior** | [`V2_04_PERSON_FOUNDATION_PHASE1.md`](./V2_04_PERSON_FOUNDATION_PHASE1.md), AC [`ACTIVECLINIC_PATIENT_DUPLICATE_DETECTION.md`](../activeclinic/clinical/ACTIVECLINIC_PATIENT_DUPLICATE_DETECTION.md) |
| **UI** | Not implemented |
| **Auto-merge** | **Never** |

---

## 1. First principles (AC inspection)

Inspected `activeClinicPatientDuplicateService.js` + `patientRepository.findDuplicateCandidates`.

| Existing AC behavior | Preserved? |
|----------------------|------------|
| HCO/org-scoped candidate query | **Yes** — still AC-owned fetch |
| Privacy masking (`maskPhone`, display name, approximate age) | **Yes** — still AC presenter |
| Public API `findPotentialPatientDuplicates` | **Yes** — same shape (`matchStrength`, `blocking`, `hasStrong`, `hasModerate`) |
| Phone exact → strong warning (overrideable) | **Yes** — maps to `STRONG_POSSIBLE_MATCH` → AC `strong` |
| Identifier live hit → strong | **Yes** → `EXACT_IDENTIFIER_MATCH` → AC `strong` |
| Email+name / name+DOB → moderate | **Yes** → `POSSIBLE_MATCH` → AC `moderate` |
| Name only → weak non-blocking | **Yes** |
| No automatic merge | **Yes** |

**Decision:** Extract pure scoring into platform; **do not replace** AC candidate fetch, override workflow, or ACN10 UI contract. AC now calls the shared scorer/engine internally.

---

## 2. Shared result contract

```text
EXACT_IDENTIFIER_MATCH   — product/authoritative identifier exact (Church ID, Patient Number, NRC, …)
STRONG_POSSIBLE_MATCH    — e.g. exact normalized phone (NOT proof of same person)
POSSIBLE_MATCH           — email+name, name+DOB, name-only
NO_MATCH                 — no overlapping signals
```

**Hard rules encoded in scoring:**

- Phone alone is **never** `EXACT_IDENTIFIER_MATCH`.
- Shared / family phones remain possible (`shared_phone_possible` reason when names diverge).
- Engine **never** merges records.
- Engine **never** loads candidates itself — caller supplies tenant-scoped rows.

---

## 3. Architecture

```text
Caller (BB or AC)
  │  supplies trusted org + product-scoped candidates
  ▼
platform/person/duplicate
  ├── scorePersonMatch          (pure pair scoring)
  ├── evaluatePersonDuplicates  (tenant/product isolation + policy)
  └── duplicatePolicies         (BB / AC / baseline decide())
  ▼
Product presenter (adapter.presentMatch)
  └── decides which fields are safe to show
```

Platform does **not** `require` BlessBoard/ActiveClinic inside the scoring module. Policies are data objects; products register them on `personProductAdapter`.

---

## 4. Product policies

### BlessBoard

| Match | Action |
|-------|--------|
| Duplicate Church ID / `member_number` within org | **BLOCK** (no override at match layer) |
| Phone / email / name+DOB / name-only | **WARN** |

Service: `src/blessboard/services/blessBoardMemberDuplicateService.js`

### ActiveClinic (stronger than baseline — reused)

| Match | Action |
|-------|--------|
| Exact Patient Number / authoritative identifier | **BLOCK** |
| Phone exact / email+name / name+DOB | **WARN_REVIEW** + `blocking: true` + override allowed (existing ACN10 gate) |
| Name-only | **WARN**, non-blocking |

Service: still `activeClinicPatientDuplicateService.js` (refactored to shared engine).

---

## 5. Tenant / product privacy

| Control | Behavior |
|---------|----------|
| Cross-tenant candidates | **Rejected** (`cross_tenant_candidate_rejected`) — no matches returned |
| Cross-product candidates | **Rejected** by default (`cross_product_candidate_rejected`) |
| Default presenter | Returns `subjectRef` + reasons only — **no raw phone/email/name** |
| Product presenter | AC masks phone; BB returns presence hints only |

---

## 6. Artifacts

### Platform

- `src/platform/person/duplicate/matchCodes.js`
- `src/platform/person/duplicate/scorePersonMatch.js`
- `src/platform/person/duplicate/duplicatePolicies.js`
- `src/platform/person/duplicate/personDuplicateEngine.js`
- `src/platform/person/duplicate/index.js`

### Product wiring

- AC duplicate service → shared `evaluatePersonDuplicates` + strength mapping
- BB `blessBoardMemberDuplicateService.js`
- Bootstraps register `duplicatePolicy` + `presentMatch` on person adapters

### Tests

- `tests/v2-04-person-duplicate-engine.test.js`

Covers: exact identifier, normalized phone, same phone different person, name+DOB, no match, cross-tenant isolation, cross-product isolation, false-positive prevention, BB BLOCK, AC WARN_REVIEW, AC strength mapping compatibility.

---

## 7. What was not done (by design)

- No Stitch / staff UI
- No automatic merge
- No replacement of AC patient directory screens
- No production DB migration for duplicates (scoring is code-level; Phase 1 person tables unchanged)
- No backfill of `platform.persons` for dedupe (candidates still come from product tables)

---

## 8. Test evidence

```text
node --test tests/v2-04-person-duplicate-engine.test.js tests/v2-04-person-foundation-phase1.test.js
# tests 30, pass 30, fail 0
```

---

## 9. Next (optional later phases)

- Wire BB staff member create path to `findPotentialBlessBoardMemberDuplicates` when Church ID exists
- Optional: characterization Postgres tests confirming AC foundation suite still green against live DB
- Stitch duplicate panel only when designs arrive

---

PHASE2_SHARED_DUPLICATE_ENGINE_PASS
