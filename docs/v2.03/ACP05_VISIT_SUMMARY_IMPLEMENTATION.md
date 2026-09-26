# ActiveClinic V2.03 — AC-P05 Released Visit Summary MVP

| Field | Value |
|-------|--------|
| **Doc ID** | `ACP05_VISIT_SUMMARY_IMPLEMENTATION` |
| **Date** | 2026-09-26 |
| **Tip baseline** | `0ae80582` (ACN18 clinical documents) |
| **Stitch project** | `7300898757945019896` |
| **Desktop screen** | `cd4b21d6860843c6b6862f92326857af` |
| **Mobile 390px screen** | `5df55128997f4b9b916852f26b972bb5` |
| **Verdict** | `V2_03_ACP05_IMPLEMENTATION_PASS_WITH_STORAGE_GAP` |

---

## Product decision

AC-P05 is a **patient-safe RELEASED visit summary**.

A completed clinical encounter is **not** automatically patient-visible. The patient portal must **not** reconstruct summaries from raw clinical records on each request. Clinicians must explicitly release an allowlisted snapshot.

---

## Patient-safe field contract

| Candidate source | Classification | Projection |
|------------------|----------------|------------|
| Encounter opened_at → visitDate | PATIENT_SAFE | Included |
| Facility display name | PATIENT_SAFE | Included |
| Practitioner (signed note author / opener) | PATIENT_SAFE | Included (overridable on release) |
| Encounter type → service label | PATIENT_SAFE | Included (overridable) |
| Encounter number / type | PATIENT_SAFE | Included as context |
| Signed `subjective_text` → reason for visit | REQUIRES_EXPLICIT_PROJECTION | Included when present / overridable |
| Signed `assessment_text` | REQUIRES_EXPLICIT_PROJECTION | Included when present / overridable |
| Signed `plan_text` → care provided | REQUIRES_EXPLICIT_PROJECTION | Included when present / overridable |
| Signed `medication_text` + Rx order labels | REQUIRES_EXPLICIT_PROJECTION | Included as medications array |
| Patient instructions | REQUIRES_EXPLICIT_PROJECTION | **Release-form override only** (never auto-copy ambiguous chart text) |
| Signed `follow_up_plan_text` | REQUIRES_EXPLICIT_PROJECTION | Included when present / overridable |
| Patient invoice (tenant_id = org, same facility) | PATIENT_SAFE | Invoice number + portal invoices link |
| Raw `consultation_notes` row / status / ids | INTERNAL_ONLY | **Never exposed** |
| `objective_text`, `additional_notes`, `referral_text` | INTERNAL_ONLY | Excluded |
| Triage, vitals, diagnosis codes, nursing intake | INTERNAL_ONLY | Excluded |
| ACN18 clinical documents (any status) | INTERNAL_ONLY | Excluded — separate domain |
| Internal audit payloads | INTERNAL_ONLY | Excluded |
| Appointment ↔ encounter FK | UNAVAILABLE | Booking link uses snapshot `visitDate` date-match |

**Raw `consultation_notes` are never serialized into the snapshot or patient HTML.**

---

## Release model

| Rule | Behavior |
|------|----------|
| Explicit release | Required (`Release to Patient`) |
| Auto on encounter complete | **No** |
| Auto on appointment / billing / Rx | **No** |
| Snapshot | Allowlisted JSON (`schemaVersion: 1`) stored in `snapshot_json` |
| Immutability | **Model A** — one immutable release per encounter (`UNIQUE(encounter_id)`); re-release rejected (`ALREADY_RELEASED`) |
| Patient read path | Released snapshot only |

---

## Domain

**Migration:** `db/migrations/activeclinic/042_patient_visit_summary_releases.sql`

Table: `activeclinic.patient_visit_summary_releases`

| Column | Purpose |
|--------|---------|
| id | Release id |
| organization_id / healthcare_organization_id / facility_id | Tenant + facility scope |
| patient_id / encounter_id | Subject |
| snapshot_json | Patient-safe projection |
| released_by_staff_id / released_at | Release actor + time |
| created_at / updated_at | Repo convention |

Permission seed: `activeclinic.visit_summary.release` → role `activeclinic_clinician` only.

### Migration application

| Target | Applied |
|--------|---------|
| Testing (`moovex-platform-v7` / `testing`) | **YES** — only pending file was `042` |
| Production | **NO** |

---

## RBAC

| Capability | Permission | Grants |
|------------|------------|--------|
| **Release** | `activeclinic.visit_summary.release` | `activeclinic_clinician` only |
| **Patient view** | Authenticated patient portal session for matching `patient_id` | Own releases only |

Facility admin / org admin / receptionist do **not** receive release by default (managing the facility ≠ releasing PHI projections).

---

## Patient authorization

For every AC-P05 patient request:

1. Authenticated patient required
2. `summary.patient_id` must match authenticated patient
3. Organization context must match
4. Unreleased encounters are invisible (no list entry, no detail)
5. Forged summary/encounter IDs return **404** (no existence leak)

---

## Routes

### Staff (clinical workflow)

| Method | Path |
|--------|------|
| GET/POST | `/app/clinical/encounter/:encounterId/visit-summary/release` |

Linked from B2-06 consultation workspace when actor has release permission. Preview shows exactly what becomes patient-visible.

### Patient portal

| Method | Path |
|--------|------|
| GET | `/clinics/:clinicKey/patient/visit-summaries` |
| GET | `/clinics/:clinicKey/patient/visit-summaries/:summaryId` |

### Portal integration

| Surface | Behavior |
|---------|----------|
| AC-P03 bookings | `View Visit Summary` only when a release matches booking preferred date |
| AC-P04 booking detail | Same conditional link |
| AC-P06 invoices | Contextual `View Invoice` when snapshot includes invoice ref |

---

## Audit

| Event | Mechanism |
|-------|-----------|
| Release | Platform `recordAuditEventSafe` — `activeclinic.visit_summary.released` with encounter/patient/facility |

Patient view audit: not added as a parallel framework (optional later if portal audit helpers are reusable cleanly).

---

## ACN18 separation

| Domain | Ownership |
|--------|-----------|
| ACN18 | Staff clinical documents (draft/final text) |
| AC-P05 | Explicit patient-safe release snapshots |

No automatic patient exposure of ACN18 documents. Final ACN18 ≠ released visit summary. Raw ACN18 body is never copied into AC-P05 without a future explicit projection design.

---

## Stitch mapping

Remapped onto frozen V2.03 **patient portal** tokens/components (AC-P03/P04/P06/P07). Staff shell is **not** used for patient AC-P05.

| Marker | Value |
|--------|-------|
| Desktop | `cd4b21d6860843c6b6862f92326857af` |
| Mobile | `5df55128997f4b9b916852f26b972bb5` |
| CSS stamp | `v2-03-b3-acp05-01` |
| Layout | Single column; cards; ≥44px controls at 390px; print hides nav/toolbar |

---

## PDF / storage gap

| Item | Status |
|------|--------|
| Browser print | Supported (HTML canonical) |
| Durable PDF download / private PHI storage | **DEFERRED** — `VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED` |

Public CMS / Hostinger media are unsuitable for patient PHI PDF binaries.

---

## Tests

`tests/activeclinic-batch3-acp05-visit-summary.test.js`

Covers: unreleased invisible; explicit release; correct patient visibility; no raw notes / internal fields; cross-patient + forged denied; clinician release OK; facility admin denied; snapshot stable after clinical mutation; AC-P03/P04 link gating; Stitch/desktop/mobile markers.

Regression: B1 / B2 / B3 (ACN27 + ACN18 + AC-P05) + RBAC / isolation — see return block.

---

## Intentional gaps

- PDF binary pipeline / private object storage
- Re-release / version history (MVP = one immutable release)
- Automatic booking↔encounter FK linkage (date-match only)
- Auto-projection of patient instructions from chart
- Patient view audit stream
- ACN18 → AC-P05 document bridge

---

## Production / deploy

**Not pushed. Not deployed. Production untouched.**
