# ActiveClinic V2.03 Batch 3 — Open Decisions (ACN18 + AC-P05)

**Status:** Decision gate complete — **neither screen implemented**.  
**Date:** 2026-09-26  
**Stitch project:** `projects/3741389873539108242` (internal ops / Juflona pilot lineage for staff; portal screens in same Batch 3 pack)  
**Authority:** Batch 3 Stitch HTML + screenshots, `ACTIVECLINIC_BATCH3_PREIMPLEMENTATION_ANALYSIS.md`, `ACTIVECLINIC_BATCH3_PREPARATION_MODE.md`, current V10 routes/services/DB/RBAC.

**Rule applied:** Analyze first. Implement only if classified `READY_*`. Do not invent product answers, persistence, release policy, or PHI projections.

---

## Verdict summary

| Screen | Primary classification | Co-classifications | Implemented | Status |
|--------|------------------------|--------------------|-------------|--------|
| **ACN18** Clinical Documents | `PRODUCT_DECISION_REQUIRED` | `BACKEND_CAPABILITY_REQUIRED`, `SECURITY_MODEL_REQUIRED` | **NO** | **BLOCKED** |
| **AC-P05** Visit Summaries | `PRODUCT_DECISION_REQUIRED` | `SECURITY_MODEL_REQUIRED`, `BACKEND_CAPABILITY_REQUIRED` | **NO** | **BLOCKED** |

Neither screen is `READY_AS_EXISTING_BACKEND_PRESENTATION` or `READY_WITH_SMALL_ADDITIVE_UI`.

---

## ACN18 — Clinical Documents

**Stitch:** Desktop `13053c54723e41e1aad43f5343e7c753` · Mobile `22222fdd59f7474fbe1dfb9967b6747c`

### 1. Exact Stitch purpose

Staff **encounter-scoped clinical document archive / EHR index** for an active patient chart:

- List indexed clinical artifacts (PDF, DICOM, HL7/CDA, native notes) with category, encounter ref, author, timestamp, status.
- Categories shown: Clinical Note, Laboratory Document, Referral, Discharge / Visit, Other Clinical.
- Statuses: Signed & Verified, Preliminary / In Review, Final, Addended.
- Filters: encounter time window, document status, category.
- Actions: **Upload Document** / Upload Clinical Document / Upload & Index, **Export Index**, View / download per record.
- Mobile companion: category chips + upload CTA on the same patient/encounter context.
- Compliance chrome in mock: “HIPAA / 21 CFR Part 11 Active”, MD5/hash display — aspirational UI, not evidence of an existing AC engine.

This is **not** website CMS media and **not** free-text consultation workspace alone.

### 2. Intended actor

Authenticated **clinical staff** on the active patient chart (Stitch: attending physician + bedside RN context). Not patient portal.

### 3. Entry route

**None exists today.**

Intended shape (not invented as implemented): staff clinical / patient-chart path such as encounter- or patient-scoped `/app/.../documents` under existing clinical shell — **route not present** in `activeClinicClinicalRoutes.js` or navigation.

### 4. Source data

**No clinical document entity or archive table** under `activeclinic`.

Nearby (non-equivalent) sources that must **not** be overloaded:

| Source | Why insufficient |
|--------|------------------|
| Website / platform CMS media (`/clinics/:clinicKey/website/media`, website media kinds including `document`) | Marketing/CMS assets — prep rule: **Website CMS media ≠ clinical documents** |
| `consultation_notes` | Narrative note rows + sign workflow — not a multi-format document library |
| Clinical orders / pharmacy / diagnostics | Domain-specific worklists — not a unified EHR document index |
| BlessBoard church media | Wrong product |

### 5. Write actions (Stitch)

- Upload / index clinical document (file + category + encounter linkage).
- Export index (bulk).
- View / download individual artifacts (implied signed delivery).
- Status transitions (draft → preliminary → signed/verified / addendum) implied by filters — **no AC state machine exists**.

### 6. RBAC

No catalogue keys such as `activeclinic.clinical_document.view|upload|manage`.

Consultation domain copy in RBAC seed mentions “clinical documentation” generically (`088_activeclinic_rbac_role_catalogue.sql`) but does **not** grant a document-archive capability.

Would need new keys + role grants + isolation tests — **not inventable in this gate**.

### 7. Tenant / facility scope

Must be tenant- and facility-scoped like other clinical PHI (patient + encounter ownership). Stitch shows a single ambulatory unit context; V10 has no document rows to scope.

### 8. Existing backend support

| Layer | Present? |
|-------|----------|
| Dedicated routes | **No** |
| Clinical document service / repository | **No** (`grep` over JS/SQL: no `clinical_document` / visit-document archive) |
| DB table | **No** |
| RBAC keys | **No** |
| Platform media (generic) | Yes — **candidate adapter only** after product chooses storage model; not wired as EHR docs |

### 9. Existing UI overlap

| Surface | Overlap |
|---------|---------|
| Consultation workspace (`consultation-workspace-content.ejs`) | Clinical **note** editing — not document library |
| Website media library | Visual “media list” patterns only; wrong domain |
| Orders / diagnostics / pharmacy queues | Artifact-adjacent but separate modules |
| ACN20 referral UI | May eventually attach referral PDFs — **depends on ACN18**; must not fake uploads now |

### 10. Missing product decision

1. **Storage model:** platform media adapter with `ac.clinical_document` metadata **vs** dedicated clinical blob store (prep Q4).
2. **Taxonomy:** which Stitch categories are in-scope for V2.03 (notes-only vs labs vs DICOM vs HL7 ingest).
3. **Lifecycle:** draft / preliminary / signed / addendum semantics and who may transition them.
4. **Scope key:** patient-level archive vs encounter-only vs both.
5. **Export Index / compliance badges:** required product behavior vs decorative Stitch chrome.
6. Relationship to diagnostics/lab results already stored elsewhere (dedupe vs index-of-record).

### 11. Missing backend capability

- Migration for clinical document metadata (+ blob pointer).
- Upload/index/list/get/download services with tenant/facility/patient/encounter isolation.
- Optional content-hash / audit trail if product requires Part-11-like evidence.
- Signed URL or controlled download path that is **not** public website media.
- RBAC seed + route guards + regression tests.

### 12. Security implications

- PHI at rest and in transit; wrong reuse of CMS media paths risks public or weakly scoped exposure.
- Need access audit for view/download/upload.
- Role separation (who uploads vs who signs vs who exports).
- Cross-tenant / cross-patient isolation mandatory before any list UI.
- Do **not** surface draft or unsigned clinician notes as “documents” without policy.

### Classification — ACN18

**Primary:** `PRODUCT_DECISION_REQUIRED`  
**Also:** `BACKEND_CAPABILITY_REQUIRED`, `SECURITY_MODEL_REQUIRED`  
**Not READY.** No safe minimum presentation without inventing entity + storage + RBAC.

**Implemented:** NO  
**Blocker:** No clinical-document domain (route/service/table/RBAC); open product choice on storage + taxonomy; PHI security model undefined. Leave blocked.

---

## AC-P05 — Patient Portal / Visit Summaries

**Stitch:** Desktop `24ad0b96c4ca4d709b78e1121dd5015f` · Mobile `ee5e5577e3e04e52bf4b9173eb191c78`

### 1. Exact Stitch purpose

Patient portal **Past Care → Visit Summaries & After-Care**:

- List past completed visits (specialty / date filters) with clinician, location, completion badge.
- Detail: visit overview & diagnosis, doctor plain-language explanation, key vitals, prescriptions from visit, investigations/orders, follow-up / self-care plan, when-to-contact.
- Actions: Download PDF, Print, Ask Question / message clinician, call clinic.
- Nav chrome: Dashboard, Appointments, Messages, Medical Records, Billing & Insurance (Stitch portal IA — not all wired in V10).

Patient-safe after-visit packet — **not** the full staff chart.

### 2. Intended actor

Authenticated **patient portal** user (own records only). Guest booking token is **not** established as an entry for full visit summaries.

### 3. Entry route

**None exists today.**

Portal today (`activeClinicPatientPortalRoutes` and siblings): dashboard, bookings (+ detail/cancel/reschedule), profile/security/data-boundaries, invoices/receipts (AC-P06), etc.  
**No** `/clinics/:clinicKey/patient/visit-summaries` (or Medical Records / summaries) route.

Marketing copy on `for-patients.ejs` mentions “past visit summaries” aspirationally — not an implemented feature.

### 4. Source data

Staff-side **candidates** (not patient-safe as-is):

| Source | Notes |
|--------|-------|
| `activeclinic.encounters` | Visit container |
| `activeclinic.consultation_notes` (+ `signed_at`) | Clinician narrative; signing via `signConsultationNote` |
| Diagnoses / vitals / clinical orders / pharmacy prescriptions | Exist in staff domain; **no patient-publish projection** |
| Portal bookings (`public_booking_requests`) | Schedule artifacts — not clinical visit summaries |

**Missing:** `visit_summaries` / `patient_visible_artifacts` (or equivalent) with release/publish metadata. No patient-visible projector service.

### 5. Write actions (Stitch)

Mostly **read**. Patient-side writes implied:

- Download PDF / print (read + render).
- Ask Question / send message to clinician (messaging — separate capability, not assumed present).
- Schedule / call CTAs (navigation / tel links).

**Staff write** required for product truth: release/publish (or auto-release rule) — **not designed**.

### 6. RBAC / authz

Patient portal session (`requirePatientAuth`) is necessary but **not sufficient**.

Must not reuse staff keys (`encounter.view`, consultation view/sign). Needs explicit **patient-safe release** rules:

- Only released summaries for the linked `patient_id`.
- Never draft notes, full chart, other patients, or staff-only fields.
- Cross-patient isolation tests mandatory (pattern used for AC-P06 billing projection).

### 7. Tenant / facility scope

Portal is clinicKey-scoped; clinical rows are tenant/facility/patient scoped. Release model must bind summary → patient → portal identity without leaking sibling facilities’ PHI unless product says otherwise.

### 8. Existing backend support

| Layer | Present? |
|-------|----------|
| Portal visit-summary routes | **No** |
| Patient-safe summary projector | **No** |
| Publish / release workflow | **No** |
| PDF generation for patient summary | **No** (Stitch shows Download PDF) |
| Signed consultation notes (staff) | **Yes** — internal only |
| Portal messaging to attending | **Not established** as Batch 3 dependency |

### 9. Existing UI overlap

| Surface | Overlap |
|---------|---------|
| AC-P03 bookings list | Past appointments — **schedule**, not clinical summary |
| Staff ACN15 consultation / sign | Source of clinical truth — **must not** be deep-linked raw into portal |
| AC-P06 invoices | Portal list/detail pattern reusable **after** release model exists |
| MF11 exploration (legacy audit) | Historical exploration only — not V10 delivery |

AC-P03 pass intentionally omitted demo “visit summaries” blocks from bookings UI.

### 10. Missing product decision

1. **Who releases** visit summaries to patients — auto on encounter complete vs clinician publish vs admin (prep Q3).
2. **Content contract:** which fields from Stitch are in V2.03 (plain-language note, vitals, meds, orders, care plan) vs deferred.
3. **Redaction:** what never leaves the chart (internal assessment, allergies detail policy, full order payloads).
4. **PDF / print / Ask Question:** required now vs later; messaging dependency.
5. **List source:** completed staff encounters only vs also closed portal bookings without clinical notes.
6. Whether unsigned / draft notes can ever appear (default answer must be **no** until decided).

### 11. Missing backend capability

- Release/publish persistence (or explicit product rule + query that encodes it).
- Portal list + detail read APIs with ownership checks.
- Safe DTO mapping from clinical tables → patient vocabulary.
- Optional PDF renderer.
- Audit of patient access to clinical summaries.
- Isolation + regression tests.

### 12. Security implications

- **Highest Batch 3 privacy risk** among remaining screens: accidental exposure of full EHR via “thin” portal UI.
- Draft/unsigned note leak.
- Cross-patient / cross-tenant leakage.
- Download/PDF caching and URL guessing.
- Messaging “Ask Question” must not open arbitrary clinician PHI threads without its own authz model.
- Staff `encounter.view` must never imply portal visibility.

### Classification — AC-P05

**Primary:** `PRODUCT_DECISION_REQUIRED`  
**Also:** `SECURITY_MODEL_REQUIRED`, `BACKEND_CAPABILITY_REQUIRED`  
**Not READY.** Quoting signed notes or inventing auto-release would be speculative and unsafe.

**Implemented:** NO  
**Blocker:** No portal routes/projector/release table; release policy undecided; patient-visible PHI security model required before any UI. Leave blocked.

---

## Explicit non-actions (this gate)

- No new routes, services, migrations, RBAC keys, or EJS for ACN18 or AC-P05.
- No “coming soon” fake document/summary lists backed by CMS media or raw `consultation_notes`.
- No commit for speculative presentation (nothing to implement safely).
- No push / no deploy.

---

## Decision checklist for product (unblockers)

Answer in writing before any implementation ticket:

### ACN18

- [ ] Storage: platform media adapter **or** dedicated clinical blob store?
- [ ] In-scope categories for V2.03?
- [ ] Document lifecycle + who uploads / signs / exports?
- [ ] Patient vs encounter scoping?
- [ ] RBAC key names + role matrix?

### AC-P05

- [ ] Release trigger: auto vs clinician publish vs other?
- [ ] Field-level patient-visible contract (and exclusions)?
- [ ] PDF / messaging in or out of first ship?
- [ ] Authz rules + audit requirements signed off by product/security?

Until checked, keep both screens **BLOCKED**.

---

## Related docs

| Doc | Role |
|-----|------|
| `docs/v2.03/ACTIVECLINIC_BATCH3_PREIMPLEMENTATION_ANALYSIS.md` | Per-screen A–J lenses (ACN18, AC-P05) |
| `docs/v2.03/ACTIVECLINIC_BATCH3_PREPARATION_MODE.md` | Tier C schema/privacy gate; open Q3–Q4 |
| `docs/v2.03/ACTIVECLINIC_BATCH3_COLLISION_SCREENS.md` | Prior collision gate (ACN27 / AC-P06) |
| `docs/activeclinic/ACTIVECLINIC_PRODUCT_GAPS.md` | CDS / auto-clinical gaps (do not invent) |

---

**Marker:** `V2_03_BATCH3_DECISION_GATE_COMPLETE`
