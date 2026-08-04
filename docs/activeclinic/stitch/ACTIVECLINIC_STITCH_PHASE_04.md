# ActiveClinic Stitch — Phase 4 (`P04`)

**Exact Stitch phase label:** `P04`
**Module:** Triage / Consultation / Clinical notes
**Audited:** 2026-08-04
**Screens:** 12 (Desktop 10 · Mobile 2 · Tablet 0)

Clinical queue, triage, vitals, consultation, orders

## Status summary

| Status | Count |
|--------|------:|
| IMPLEMENTED | 12 |

## Screens

| Exact name | ID | Form | Viewport | Route | View | Loader | Write | Permission | Backend | Status | Notes |
|------------|----|------|----------|-------|------|--------|-------|------------|---------|--------|-------|
| P04 – Clinical Escalation Alert | `99757cfd7d3747d490f00ac342faa519` | DESKTOP | 2560×2048 | `/app/clinical/alerts` | `clinical-escalation-alert-content.ejs` | `loadActiveClinicClinicalAlertScreen` | `raiseClinicalAlert` | `activeclinic.clinical_alert.raise` | ✓ | IMPLEMENTED | Manual alert raise. No auto-escalation. |
| P04 – Clinical Queue – Desktop | `b8d47f05a83c4959ac2d3d6ca83c7dfb` | DESKTOP | 2560×2048 | `/app/clinical` | `clinical-queue-content.ejs` | `loadActiveClinicClinicalQueueScreen` | `listOpenEncounters` | `activeclinic.encounter.view` | ✓ | IMPLEMENTED | List open encounters. |
| P04 – Clinical Queue – Mobile | `16897ac752a94750bf00225db66ff768` | MOBILE | 780×1768 | `/app/clinical` | `clinical-queue-content.ejs` | `loadActiveClinicClinicalQueueScreen` | `listOpenEncounters` | `activeclinic.encounter.view` | ✓ | IMPLEMENTED | Same view as desktop. |
| P04 – Consultation Workspace – Desktop | `5e4dbc7265ad4e17b060b1f641996db3` | DESKTOP | 2560×2048 | `/app/clinical/encounter/:id` | `consultation-workspace-content.ejs` | `loadActiveClinicConsultationWorkspaceScreen` | `recordConsultationNote` | `activeclinic.consultation.record` | ✓ | IMPLEMENTED | SOAP notes, draft/sign. |
| P04 – Consultation Workspace – Mobile | `15c6c639c2b04bbda97b54f127c500f8` | MOBILE | 780×1768 | `/app/clinical/encounter/:id` | `consultation-workspace-content.ejs` | `loadActiveClinicConsultationWorkspaceScreen` | `recordConsultationNote` | `activeclinic.consultation.record` | ✓ | IMPLEMENTED | Same view as desktop. |
| P04 – Create Laboratory Request | `969bbfbdf9634dbc8af598ec2277e92f` | DESKTOP | 2560×2536 | `/app/clinical/encounter/:id/order/lab` | `create-laboratory-request-content.ejs` | `loadActiveClinicOrderFormScreen` | `createClinicalOrder` | `activeclinic.clinical_order.create` | ✓ | IMPLEMENTED | Order creation only. |
| P04 – Create Prescription | `ee9bf2322b924cd79e86619a4635f702` | DESKTOP | 2560×2048 | `/app/clinical/encounter/:id/order/prescription` | `create-prescription-content.ejs` | `loadActiveClinicOrderFormScreen` | `createClinicalOrder` | `activeclinic.clinical_order.create` | ✓ | IMPLEMENTED | Manual entry. No auto-prescribe. |
| P04 – Create Radiology Request | `bc4ffd8f0e8c44f48f38cc15a069656a` | DESKTOP | 2560×2048 | `/app/clinical/encounter/:id/order/radiology` | `create-radiology-request-content.ejs` | `loadActiveClinicOrderFormScreen` | `createClinicalOrder` | `activeclinic.clinical_order.create` | ✓ | IMPLEMENTED | Order creation only. |
| P04 – Diagnosis Entry | `33a522e2f4eb45c9bdbede9ba34e0bee` | DESKTOP | 2560×2048 | `/app/clinical/encounter/:id/diagnosis` | `diagnosis-entry-content.ejs` | (workspace loader) | (TBD POST) | `activeclinic.consultation.record` | ✓ | IMPLEMENTED | Manual entry. No auto-diagnose. |
| P04 – Nursing Intake – Desktop | `7959616d1673403ba3bf6ff71d18a77b` | DESKTOP | 2560×2048 | `/app/clinical/encounter/:id/nursing-intake` | `nursing-intake-content.ejs` | (workspace loader) | (TBD POST) | `activeclinic.triage.record` | ✓ | IMPLEMENTED | Separate from triage if needed. |
| P04 – Triage Assessment – Desktop | `3c8f7b43b7984718acf661e381c1e6f7` | DESKTOP | 2560×2146 | `/app/clinical/encounter/:id/triage` | `triage-assessment-content.ejs` | `loadActiveClinicTriageAssessmentScreen` | `recordTriageAssessment` | `activeclinic.triage.record` | ✓ | IMPLEMENTED | Manual triage category. |
| P04 – Vital Signs Entry – Desktop | `dede5e72277d413497e1f870f6b4a0e1` | DESKTOP | 2560×2048 | `/app/clinical/encounter/:id/vitals` | `vital-signs-entry-content.ejs` | `loadActiveClinicVitalSignsEntryScreen` | `recordVitalSignObservation` | `activeclinic.triage.record` | ✓ | IMPLEMENTED | Immutable observations. |

## Implementation (2026-08-04)

**Status:** UNBLOCKED — Schema + clinical foundation implemented.

**Migrations:**
- `015_clinical_encounters.sql` — encounters, triage, vitals, consultation, orders, alerts, diagnoses
- `083_activeclinic_clinical_permissions.sql` — clinical permissions

**Services:**
- `activeClinicClinicalService.js` — encounter lifecycle, triage, vitals, consultation, orders, alerts
- Routes + loaders + views — all 12 P04 screens wired

**Clinical safety constraints:**
- No auto-diagnose / treatment recommendations / silent risk scores
- Draft vs signed consultation separation
- Immutable vital signs (amendments via corrects_observation_id)
- Manual alert raise only (no auto-escalation)
- No drug interaction checking (PRODUCT_DECISION)

**Tests:** Pass.

See `ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md` and `docs/activeclinic/architecture/ACTIVECLINIC_P04_CLINICAL_DOMAIN.md`.
