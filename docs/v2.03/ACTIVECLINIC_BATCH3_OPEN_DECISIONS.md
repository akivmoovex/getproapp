# ActiveClinic V2.03 Batch 3 — Open Decisions & Scope Freeze

**Status:** V2.03 Batch 3 **new-screen MVP implemented** (ACN27 / ACN18 / AC-P05) with documented intentional gaps.  
**Date:** 2026-09-26 (updated: final new-screens reconciliation)  
**Branch:** `V10`  
**Application tip (AC-P05 implementation):** `4d0ce4906550092430c29bdf0ea886601ffe5d32`  
**Reconciliation freeze tip:** commit message `V2.03 reconcile ACN27 ACN18 AC-P05 freeze record` (see `git log -1`)  
**Prior Batch 3 freeze SHA (pre–new screens):** `0014616f6161b839344039ef7ed44cebeffb9f27`  
**Prior Batch 3 Stitch (earlier leaves):** `projects/3741389873539108242`  
**New-screen Stitch project:** `projects/7300898757945019896`  
**Authority:** Batch 3 Stitch, product-authorized MVP implementations, [`ACTIVECLINIC_BATCH3_NEW_STITCH_SCREEN_AUDIT.md`](./ACTIVECLINIC_BATCH3_NEW_STITCH_SCREEN_AUDIT.md), [`V2_03_NEW_SCREENS_FINAL_RECONCILIATION.md`](../qa/V2_03_NEW_SCREENS_FINAL_RECONCILIATION.md).

**Rule:** Do not invent product answers beyond the authorized MVP. Intentional storage/security gaps remain deferred — they are **not** silent incompleteness.

---

## V2.03 Batch 3 scope summary

### IMPLEMENTED

| Code | Title | Notes |
|------|-------|-------|
| **ACN17** | Vitals & Observations | Prior Batch 3 leaf |
| **ACN19** | Prescription Editor | Prior Batch 3 leaf |
| **ACN20** | Referral Management (B over `pending_referral`) | Prior Batch 3 leaf |
| **AC-P03** | My Appointments | Prior Batch 3 leaf |
| **AC-P04** | Appointment Detail & Reschedule | Prior Batch 3 leaf |
| **AC-P06** | Invoices & Receipts (portal read) | Prior Batch 3 leaf |
| **AC-P07** | Profile & Contact Details | Prior Batch 3 leaf |
| **ACN27** | Rooms & Spaces | MVP — `a1dd4e5b`; facility-required / department-optional; `/app/rooms` |
| **ACN18** | Clinical Documents | MVP — `0ae80582`; draft/final; **no** public CMS for PHI; binary deferred |
| **AC-P05** | Released Visit Summary | MVP — `4d0ce490`; explicit clinician release snapshot; PDF deferred |

### INTENTIONAL GAPS (not unimplemented screens)

| Domain | Deferred capability |
|--------|---------------------|
| **ACN18** | Binary/private object storage; attachment download audit; e-sign; DICOM/HL7; advanced versioning |
| **AC-P05** | PDF/private storage; re-release/versioning; booking↔encounter FK; auto patient-instructions from chart; patient-view audit; ACN18→AC-P05 bridge |
| **ACN27** | Real-time occupancy; IoT; equipment inventory; room scheduling; bed management |

See also: `docs/qa/V2_03_BATCH3_FINAL_PARITY_AUDIT.md` (historical deferral context), `docs/v2.03/ACTIVECLINIC_BATCH3_NEW_STITCH_SCREEN_AUDIT.md`, implementation records under `docs/v2.03/ACN27_*`, `ACN18_*`, `ACP05_*`.

**2026-09-26 ingestion:** Six screens in project `7300898757945019896` authorized MVP after product decisions. Design tokens remapped onto frozen V2.03 staff/patient systems (not imported MD3).

---

## ACN18 — Clinical Documents

**Stitch:** Desktop `9b5d55cc2e8445f5bf97ef98f00cf8d3` · Mobile `ee65f85e2f484eb9b147dc06c97949ad`  
**Stitch project:** `7300898757945019896`  
**Status:** **IMPLEMENTED (MVP)** — commit `0ae80582`  
**Migration:** `041_clinical_documents.sql`  
**Gap marker:** `BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED`  
**Public CMS used for clinical PHI:** **NO**

### MVP delivered

Staff clinical-document domain (`clinical_documents` + events), draft/final lifecycle, clinician create/finalize + nurse view, encounter-linked workspace entry, Stitch markers remapped to V2.03 staff tokens.

### Still deferred

Binary attachments / private storage / download audit for binaries; e-signatures; DICOM/HL7; advanced versioning; patient release of ACN18 content (separate from AC-P05).

---

## ACN27 — Rooms & Spaces

**Stitch:** Desktop `b8f071b326234022afb3eecc665be9bc` · Mobile `74a8167ce99e45388a7dd1fbe9a92a88`  
**Stitch project:** `7300898757945019896`  
**Status:** **IMPLEMENTED (MVP)** — commit `a1dd4e5b`  
**Migration:** `040_facility_rooms.sql`  
**vs B2-10:** Room inventory under facility (optional department) — **does not** own `/app/facilities`

### MVP delivered

`activeclinic.facility_rooms`, `/app/rooms` routes, RBAC via `facility.view` / `facility.update`, tenant/facility isolation, no `service_points` reuse, no occupancy engine.

### Still deferred

Occupancy / IoT / equipment / scheduling / bed management.

---

## AC-P05 — Visit Summaries

**Stitch:** Desktop `cd4b21d6860843c6b6862f92326857af` · Mobile `5df55128997f4b9b916852f26b972bb5`  
**Stitch project:** `7300898757945019896`  
**Status:** **IMPLEMENTED (MVP)** — commit `4d0ce490`  
**Migration:** `042_patient_visit_summary_releases.sql`  
**Gap marker:** `VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED`

### MVP delivered

Explicit clinician release (`activeclinic.visit_summary.release` → clinician only), immutable allowlisted snapshot per encounter, patient portal list/detail, AC-P03/P04 conditional links, optional AC-P06 invoice context, raw `consultation_notes` never exposed, ACN18 not auto-exposed.

### Still deferred

PDF pipeline / private storage; re-release versioning; stronger booking↔encounter linkage; patient-view audit stream; ACN18→AC-P05 document bridge.

---

## Decision checklist (post-reconciliation)

| Item | State |
|------|-------|
| Six new Stitch screens accounted for | **YES** |
| Testing migrations 040–042 applied (`moovex-platform-v7` / `testing`) | **YES** |
| Production migrations 040–042 | **NO** |
| Push / deploy authorized by this document | **NO** — push readiness recorded in reconciliation; deploy still blocked |

---

## Production / deploy

**Not pushed. Not deployed. Production app and production DB untouched by these MVP commits’ migration apply path.**
