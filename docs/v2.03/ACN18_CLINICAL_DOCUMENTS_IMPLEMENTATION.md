# ActiveClinic V2.03 — ACN18 Clinical Documents MVP

| Field | Value |
|-------|--------|
| **Doc ID** | `ACN18_CLINICAL_DOCUMENTS_IMPLEMENTATION` |
| **Date** | 2026-09-26 |
| **Tip baseline** | `a1dd4e5b` (ACN27 rooms) |
| **Stitch project** | `7300898757945019896` |
| **Desktop screen** | `9b5d55cc2e8445f5bf97ef98f00cf8d3` |
| **Mobile 390px screen** | `ee65f85e2f484eb9b147dc06c97949ad` |
| **Verdict** | `V2_03_ACN18_IMPLEMENTATION_PASS_WITH_PRIVATE_STORAGE_GAP` |

---

## Domain model

**New ActiveClinic clinical-document domain** (staff PHI). Separate from:

- B2-06 `consultation_notes`
- AC-P05 patient visit-summary release
- Website / CMS / BlessBoard media

### Hierarchy

```
Organization → HCO → Facility → Patient → (optional Encounter) → Clinical Document
```

### Document types

`clinical_note` · `medical_certificate` · `referral_letter` · `discharge_summary` · `clinical_attachment` · `other`

### Lifecycle

| Status | Semantics |
|--------|-----------|
| `draft` | Authorized create/edit |
| `final` | Ordinary content edits rejected (`FINAL_IMMUTABLE`) |

No electronic signature, versioning engine, or re-open-to-draft path in MVP.

---

## Storage decision

| Classification | `PUBLIC_CMS_STORAGE_ONLY` / no ActiveClinic private object store |
|----------------|------------------------------------------------------------------|
| Public CMS used | **NO** |
| Binary attachments | **DEFERRED** — `BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED` |

Inspected: BlessBoard media, Hostinger CDN/static media, website CMS uploads, pastoral local uploads (church). None provide ActiveClinic-scoped private object storage with authorized retrieval suitable for clinical PHI.

MVP stores **metadata + text body only**. Upload controls are omitted/disabled with an explicit deferred note in UI.

---

## Schema

**Migration:** `db/migrations/activeclinic/041_clinical_documents.sql`

| Table | Purpose |
|-------|---------|
| `activeclinic.clinical_documents` | Document records |
| `activeclinic.clinical_document_events` | created / updated / finalized history |

No `clinical_document_attachments` table (deferred with binary storage).

Also inserts narrowly scoped permissions into `blessboard.permissions` / `role_permissions`.

### Migration application

| Target | Applied |
|--------|---------|
| Testing (`moovex-platform-v7` / `testing`) | **YES** — only pending file was `041` |
| Production | **NO** |

---

## RBAC

New permissions (not implied by `facility.update`):

| Capability | Permission | Role grants |
|------------|------------|-------------|
| **View** | `activeclinic.clinical_document.view` | `activeclinic_clinician`, `activeclinic_nurse` |
| **Create / edit draft** | `activeclinic.clinical_document.create` | `activeclinic_clinician` |
| **Finalize** | `activeclinic.clinical_document.finalize` | `activeclinic_clinician` |
| **Download** | n/a (deferred with binary) | — |

Facility admin / receptionist / org admin do **not** receive these by default.

---

## Routes

Staff-only (no public/patient exposure):

| Method | Path |
|--------|------|
| GET | `/app/clinical/patients/:patientId/documents` |
| GET/POST | `/app/clinical/patients/:patientId/documents/new` → POST list |
| GET | `/app/clinical/patients/:patientId/documents/:documentId` |
| GET/POST | `/app/clinical/patients/:patientId/documents/:documentId/edit` → POST update |
| POST | `/app/clinical/patients/:patientId/documents/:documentId/finalize` |

B2-06 encounter workspace links into documents with `?encounter=`.

---

## Isolation

Server derives org from auth. Rejects forged patient / facility / encounter IDs; encounter must match patient + facility; no cross-tenant document reads.

---

## Audit

| Event | `clinical_document_events` | Platform audit |
|-------|----------------------------|----------------|
| created | yes | yes |
| updated | yes | yes |
| finalized | yes | yes |
| uploaded / downloaded | deferred | deferred |

---

## UI / Stitch mapping

Remapped onto frozen V2.03 tokens (Inter, `#2563EB` primary, etc.). No MD3 import.

Desktop: list/filters/table/status/Add Document.  
390px: document cards; existing 56/64 shell nav; ≥44px touch targets.

Markers: `data-ac-stitch="ACN18"` + desktop/mobile screen IDs. Shell asset: `v2-03-acn18-01`.

---

## Intentional gaps

- Binary attachments / private object storage / download auth
- Electronic signature / legal certification
- DICOM / HL7 / FHIR DocumentReference sync
- Document collaboration / external exchange
- Advanced versioning / correction workflow
- Patient release (AC-P05)
- Stitch “Signed” status (MVP uses draft/final only)
- Fabricated “Upload Scan” working control

---

## Tests

`tests/activeclinic-batch3-acn18-clinical-documents.test.js` — draft CRUD, finalize immutability, tenant/patient/encounter isolation, RBAC deny receptionist + facility admin, Stitch/storage markers.

Regression: Batch 1 / 2 / 3 (incl. ACN27) + RBAC/isolation — see return block.

---

## Production / deploy

**Not pushed. Not deployed. Production untouched.**
