# ActiveClinic P04 — Clinical Domain Architecture

**Phase:** P04 (Triage / Consultation / Clinical notes)  
**Approved:** 2026-08-04  
**Migration:** `db/migrations/activeclinic/015_clinical_encounters.sql`  
**Permissions:** `db/migrations/blessboard/083_activeclinic_clinical_permissions.sql`

## Overview

This document defines the clinical encounter lifecycle, triage workflows, consultation documentation, clinical orders, and alert management for ActiveClinic P04. All clinical data is **append-only**, **tenant-scoped**, and **facility-scoped** with strict audit requirements.

## Core principles

### 1. Clinical safety constraints

**NO autonomous clinical decision support:**
- No auto-diagnose algorithms
- No treatment recommendations
- No silent risk scores or auto-escalation (alerts must be manually raised)
- No auto-prescribing or dose calculation
- No drug interaction checking (marked PRODUCT_DECISION / blocked advanced)

**Immutability and amendments:**
- Vital sign observations: immutable rows; amendments create new linked rows
- Consultation notes: draft vs signed separation; amendments via append-only events, never delete signed notes
- Clinical diagnoses: append-only; corrections via new rows with corrects_diagnosis_id FK
- Clinical orders: draft → submitted transition; cancellation via status + event, never delete

### 2. Encounter lifecycle

**Encounter creation:**
- Initiated by reception check-in (optional link), or manually started by clinical staff
- One active encounter per patient per facility at a time
- Encounter ID becomes the grouping entity for triage, vitals, consultation, orders, alerts

**Encounter states:**
- `open` — active encounter; triage/consultation in progress
- `completed` — clinician signed consultation note and closed encounter
- `cancelled` — administrative cancellation before clinical activity

**Audit:**
- All status changes recorded in `encounter_events` (append-only)
- Actor staff ID mandatory for all clinical actions
- No destructive changes; retention = indefinite

### 3. Role-based access

**Permissions (catalogue keys):**
- `activeclinic.encounter.view` — list and view encounters for assigned facilities
- `activeclinic.encounter.manage` — start/open/close encounters
- `activeclinic.triage.record` — record triage assessments + vitals
- `activeclinic.consultation.record` — draft consultation notes
- `activeclinic.consultation.sign` — sign (finalize) consultation notes
- `activeclinic.clinical_order.create` — create lab/prescription/radiology orders
- `activeclinic.clinical_alert.view` — view active alerts
- `activeclinic.clinical_alert.raise` — manually raise escalation alerts

**Default role grants (migration 083):**
- `activeclinic_network_admin` + `activeclinic_facility_admin` only by default
- NOT granted to `activeclinic_staff` automatically (explicit assignment required)

**Facility scope enforcement:**
- Clinical staff must have active facility assignment to record clinical data
- Encounters, triage, vitals, consultations, orders scoped to facility_id
- Cross-facility encounter transfers NOT supported in P04

### 4. Tenant ownership

**Mandatory columns on all clinical tables:**
- `organization_id` → platform.organizations
- `healthcare_organization_id` → activeclinic.healthcare_organizations
- `facility_id` → activeclinic.facilities (where applicable)
- `patient_id` → activeclinic.patients
- Foreign key constraints enforcing tenant isolation

**Authorization checks:**
- Staff must belong to same organization_id
- Patient must belong to same healthcare_organization_id
- Facility must belong to same healthcare_organization_id

## Schema entities (migration 015)

### `activeclinic.encounters`

Primary clinical encounter record.

**Key columns:**
- `id` (UUID PK)
- `organization_id`, `healthcare_organization_id`, `facility_id`, `patient_id` (tenant/scope)
- `arrival_id` (UUID NULL) — optional link to reception arrival
- `encounter_number` (TEXT) — human-readable facility-scoped encounter number
- `encounter_type` (TEXT) — `outpatient`, `emergency`, `referral`, `other`
- `status` (TEXT) — `open`, `completed`, `cancelled`
- `opened_at` (TIMESTAMPTZ)
- `closed_at` (TIMESTAMPTZ NULL)
- `opened_by_staff_id`, `closed_by_staff_id` (UUID)
- `version` (INTEGER) — optimistic locking
- `created_at`, `updated_at`

**Constraints:**
- UNIQUE (facility_id, encounter_number) for active encounters
- CHECK status IN (...)
- FKs to hco, facility, patient, staff, arrival

**Indexes:**
- (facility_id, status, opened_at DESC)
- (patient_id, opened_at DESC)

### `activeclinic.encounter_events`

Append-only audit log for encounter lifecycle.

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `encounter_id`
- `event_type` (TEXT) — `opened`, `triage_recorded`, `consultation_started`, `consultation_signed`, `order_created`, `alert_raised`, `closed`, `cancelled`
- `event_metadata` (JSONB NULL) — structured context
- `actor_staff_id`, `created_at`

### `activeclinic.triage_assessments`

Structured triage + nursing intake data.

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `encounter_id`, `patient_id`
- `triage_category` (TEXT NULL) — `emergency`, `urgent`, `semi_urgent`, `non_urgent` (manual only, no auto-scoring)
- `chief_complaint` (TEXT)
- `presenting_symptoms` (TEXT NULL)
- `allergies_reported` (TEXT NULL)
- `current_medications_reported` (TEXT NULL)
- `pain_level` (INTEGER NULL) — 0-10 scale, self-reported
- `status` (TEXT) — `draft`, `completed`
- `completed_at` (TIMESTAMPTZ NULL)
- `recorded_by_staff_id`, `version`

**No auto-triage logic:** triage_category assigned manually by clinician based on policy/protocol outside system.

### `activeclinic.vital_sign_observations`

Immutable vital sign readings.

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `encounter_id`, `patient_id`
- `observation_type` (TEXT) — `blood_pressure`, `heart_rate`, `respiratory_rate`, `temperature`, `oxygen_saturation`, `weight`, `height`, `bmi`, `other`
- `value_numeric` (DECIMAL NULL)
- `value_text` (TEXT NULL)
- `unit` (TEXT NULL) — e.g. `mmHg`, `bpm`, `°C`
- `systolic`, `diastolic` (INTEGER NULL) — for blood pressure
- `observed_at` (TIMESTAMPTZ)
- `recorded_by_staff_id`
- `corrects_observation_id` (UUID NULL) — FK to self for amendments
- `correction_reason` (TEXT NULL)

**Immutability:** never UPDATE or DELETE. Amendments create new row with corrects_observation_id → original.

**Validation warnings (NOT hard blocks):**
- Out-of-range values warn staff but do NOT prevent recording
- System documents exceptional values in UI but does not auto-escalate

**Indexes:**
- (encounter_id, observed_at DESC)
- (patient_id, observation_type, observed_at DESC)

### `activeclinic.nursing_intake_notes`

Separate nursing intake documentation (distinct from triage if workflow requires).

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `encounter_id`, `patient_id`
- `intake_note_text` (TEXT)
- `recorded_by_staff_id`
- `created_at`

**Note:** If facility workflow merges nursing intake into triage assessment, this table may be lightly used or skipped. Retained for flexibility.

### `activeclinic.consultation_notes`

Clinical consultation documentation with draft/signed states.

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `encounter_id`, `patient_id`
- `note_type` (TEXT) — `consultation`, `progress`, `discharge`, `referral`
- `subjective_text` (TEXT NULL) — SOAP: Subjective
- `objective_text` (TEXT NULL) — SOAP: Objective
- `assessment_text` (TEXT NULL) — SOAP: Assessment
- `plan_text` (TEXT NULL) — SOAP: Plan
- `additional_notes` (TEXT NULL)
- `status` (TEXT) — `draft`, `signed`
- `signed_at` (TIMESTAMPTZ NULL)
- `signed_by_staff_id` (UUID NULL)
- `created_by_staff_id`
- `version`

**Amendment rules:**
- Once signed, note becomes immutable in table (no UPDATE to signed notes)
- Amendments recorded via `consultation_note_amendments` events (append-only)
- Amendment event links to original note, records amendment text + reason

**Indexes:**
- (encounter_id, created_at DESC)
- (facility_id, status, created_at DESC)

### `activeclinic.consultation_note_amendments`

Append-only amendments to signed consultation notes.

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `consultation_note_id`
- `amendment_text` (TEXT)
- `amendment_reason` (TEXT)
- `amended_by_staff_id`
- `created_at`

### `activeclinic.clinical_diagnoses`

Structured diagnosis entries linked to encounters.

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `encounter_id`, `patient_id`
- `diagnosis_code` (TEXT NULL) — ICD-10 / SNOMED / local code (optional, free text allowed)
- `diagnosis_text` (TEXT) — free text diagnosis
- `diagnosis_type` (TEXT) — `primary`, `secondary`, `differential`, `ruled_out`
- `certainty` (TEXT NULL) — `confirmed`, `suspected`, `provisional`
- `recorded_by_staff_id`
- `corrects_diagnosis_id` (UUID NULL) — FK to self for corrections
- `created_at`

**No auto-diagnose:** clinician enters manually. System does not suggest diagnoses.

**Indexes:**
- (encounter_id, created_at)
- (patient_id, created_at DESC)

### `activeclinic.clinical_orders`

Lab, prescription, radiology orders (order creation only; fulfillment = P05/P06).

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `encounter_id`, `patient_id`
- `order_type` (TEXT) — `laboratory`, `prescription`, `radiology`
- `order_details` (JSONB) — structured order parameters (test codes, medication details, imaging protocols)
- `instructions` (TEXT NULL)
- `status` (TEXT) — `draft`, `submitted`, `cancelled` (NO results status here)
- `submitted_at` (TIMESTAMPTZ NULL)
- `ordered_by_staff_id`
- `cancelled_at`, `cancelled_by_staff_id`, `cancellation_reason`
- `version`

**Order lifecycle (P04 scope):**
- Draft → Submitted (clinician approval)
- Submitted → Cancelled (clinician cancellation before fulfillment)
- Result entry, fulfillment, dispensing = P05/P06 (out of scope for P04)

**Prescription order safety:**
- Clinician enters drug name, dose, frequency, duration manually
- NO auto-prescribing, NO dose calculation, NO drug interaction checks
- System stores order details as JSONB; advanced checking = PRODUCT_DECISION / blocked

**Indexes:**
- (encounter_id, created_at DESC)
- (facility_id, order_type, status, created_at DESC)

### `activeclinic.clinical_alerts`

Manual escalation alerts (no auto-escalation in P04).

**Key columns:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `encounter_id`, `patient_id`
- `alert_type` (TEXT) — `clinical_deterioration`, `critical_result`, `resource_required`, `other`
- `alert_message` (TEXT)
- `priority` (TEXT) — `low`, `medium`, `high`, `critical`
- `status` (TEXT) — `active`, `acknowledged`, `resolved`, `cancelled`
- `raised_by_staff_id`
- `acknowledged_by_staff_id`, `acknowledged_at`
- `resolved_by_staff_id`, `resolved_at`
- `created_at`, `updated_at`
- `version`

**Manual raise only:**
- Clinician explicitly raises alert via UI action
- NO silent auto-escalation, NO background risk scoring in P04

**Indexes:**
- (facility_id, status, priority, created_at DESC)
- (encounter_id, status)

## Authorization patterns

**Service:** `activeClinicClinicalService.js`  
**Middleware:** `createRequireActiveClinicPermission(permissionKey)`

**Example checks:**
```javascript
// View clinical queue
requirePermission('activeclinic.encounter.view')

// Record triage
requirePermission('activeclinic.triage.record')

// Sign consultation note
requirePermission('activeclinic.consultation.sign')

// Create prescription order
requirePermission('activeclinic.clinical_order.create')

// Raise alert
requirePermission('activeclinic.clinical_alert.raise')
```

**Facility scope:**
- All clinical actions require active facility assignment for acting staff
- Encounter, triage, vitals, consultation, orders, alerts filtered by staff's assigned facilities

## Product gaps / blocked features (P04)

**Documented in `docs/activeclinic/PRODUCT_GAPS.md`:**

1. **Auto-escalation / risk scoring** — blocked clinical safety; manual alert raise only
2. **Drug interaction checking** — blocked advanced; requires external API / drug database integration
3. **Structured diagnosis code lookup** — ICD-10 / SNOMED integration = future phase
4. **Order result entry / fulfillment** — P05 (lab), P06 (pharmacy/radiology)
5. **Clinical decision support rules** — blocked clinical safety; no autonomous recommendations
6. **Vital sign auto-flagging** — warn only, no hard blocks, no auto-escalation
7. **Cross-facility encounter transfers** — not supported in P04; manual coordination required

## Audit and compliance

**All clinical actions audit:**
- Encounter events → `activeclinic.encounter_events`
- Triage/vitals/consultation/order/alert creation → standard audit via `platform.audit_events` + service-level audit calls
- Actor staff ID mandatory on all clinical writes
- No destructive changes; retention = indefinite

**CSRF protection:**
- All POST routes validate CSRF token
- Clinical data writes rejected if CSRF validation fails

**Unauthorized access:**
- Staff without clinical permissions see "restricted" state in UI
- No clinical data leakage in error messages

## Stitch screen mapping (P04)

See `docs/activeclinic/stitch/ACTIVECLINIC_STITCH_PHASE_04.md` for exact screen IDs.

**Routes → Screens:**
- `/app/clinical` → Clinical Queue (Desktop `b8d47f05a83c4959ac2d3d6ca83c7dfb` / Mobile `16897ac752a94750bf00225db66ff768`)
- `/app/clinical/encounter/:id` → Consultation Workspace (D `5e4dbc7265ad4e17b060b1f641996db3` / M `15c6c639c2b04bbda97b54f127c500f8`)
- `/app/clinical/encounter/:id/triage` → Triage Assessment (`3c8f7b43b7984718acf661e381c1e6f7`)
- `/app/clinical/encounter/:id/vitals` → Vital Signs Entry (`dede5e72277d413497e1f870f6b4a0e1`)
- `/app/clinical/encounter/:id/nursing-intake` → Nursing Intake (`7959616d1673403ba3bf6ff71d18a77b`)
- `/app/clinical/encounter/:id/diagnosis` → Diagnosis Entry (`33a522e2f4eb45c9bdbede9ba34e0bee`)
- `/app/clinical/encounter/:id/order/lab` → Create Laboratory Request (`969bbfbdf9634dbc8af598ec2277e92f`)
- `/app/clinical/encounter/:id/order/prescription` → Create Prescription (`ee9bf2322b924cd79e86619a4635f702`)
- `/app/clinical/encounter/:id/order/radiology` → Create Radiology Request (`bc4ffd8f0e8c44f48f38cc15a069656a`)
- `/app/clinical/alerts` → Clinical Escalation Alert (`99757cfd7d3747d490f00ac342faa519`)

## Implementation checklist

- [x] Architecture doc
- [x] Migration 015 (clinical schema)
- [x] Migration 083 (permissions)
- [~] Repositories: inline SQL in service (no dedicated repositories implemented)
- [x] Services: activeClinicClinicalService (encounter, triage, vitals, nursing intake, consultation, diagnosis, orders, alerts)
- [x] Routes: activeClinicClinicalRoutes (clinical queue, encounter workspace, triage, vitals, nursing intake, diagnosis, orders, alerts)
- [x] Loaders: loadActiveClinicClinicalScreens (queue, workspace, triage, vitals, alerts, order forms)
- [~] Views: PARTIAL - files exist with Stitch IDs, but UI parity not visually verified in browser against Stitch references
  - [x] clinical-queue-content.ejs
  - [x] consultation-workspace-content.ejs
  - [x] triage-assessment-content.ejs
  - [x] vital-signs-entry-content.ejs
  - [x] nursing-intake-content.ejs
  - [x] diagnosis-entry-content.ejs
  - [x] create-laboratory-request-content.ejs
  - [x] create-prescription-content.ejs
  - [x] create-radiology-request-content.ejs
  - [x] clinical-escalation-alert-content.ejs
  - [x] clinical-start-encounter-content.ejs
- [x] Tests: foundation (full encounter workflow, authz, tenant isolation) + UI parity (file checks, HTTP smoke)
- [x] Docs: PHASE_04.md updated with honest implementation status

---

**Approved for implementation:** 2026-08-04  
**Review:** Clinical safety constraints mandatory; no deviation without explicit approval.
