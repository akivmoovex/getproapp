# ActiveClinic V2.03 — Testing DB migrations 036–039 remediation

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_TESTING_DB_036_039_REMEDIATION` |
| **Date** | 2026-09-26 |
| **Application release SHA** | `0014616f6161b839344039ef7ed44cebeffb9f27` (frozen — **not** redeployed) |
| **Hosted SHA after remediation** | `0014616f6161` (`moovex-platform-testing` / `testing`) |
| **Remediation type** | `DB_ONLY` |
| **Mechanism** | `db/scripts/migrate-testing.js` |
| **Production** | **UNTOUCHED** |

## Verdict

**V2_03_TESTING_DB_REMEDIATION_PASS**

Identity gate PASS → drift CLEANLY_MISSING → applied existing Batch 1A migrations (plus other pending testing ledger entries in canonical order) → schema objects present → previously failing hosted routes no longer 500.

---

## 1. Pre-migration identity gate

| Check | Value |
|-------|--------|
| Deployment / application context | `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing`, `DEPLOYMENT_ENV=testing` |
| DB host (secrets removed) | `aws-0-eu-central-1.pooler.supabase.com:5432` |
| Database name | `postgres` |
| Expected identity key | `moovex-platform-v7` |
| Actual identity key | `moovex-platform-v7` |
| Expected environment | `testing` |
| Actual environment | `testing` |
| Gate | **PASS** |

---

## 2. Migration audit (repository files — not modified)

| Version | Filename | Purpose | Major objects | Destructive? | Data backfill |
|---------|----------|---------|---------------|--------------|---------------|
| 036 | `036_batch1a_services_practitioners.sql` | Services pricing + practitioner profile/availability | Columns on `appointment_service_types` / `staff_members`; tables `service_staff_assignments`, `staff_weekly_availability`, `staff_availability_blocks` | No DROP TABLE/COLUMN/TRUNCATE | None |
| 037 | `037_batch1a_appointment_canonical_statuses.sql` | Canonical appointment status vocabulary | CHECK replace on `appointments` / `appointment_status_events`; `decline_reason` on `public_booking_requests` | `DROP CONSTRAINT IF EXISTS` on status CHECKs (designed); `UPDATE` remaps legacy statuses | Status label remap (`scheduled`→`confirmed`, etc.). Pre-apply legacy row counts on testing: **0** |
| 038 | `038_batch1a_patient_consent_clinic_fields.sql` | Next-of-kin + clinical consent ledger | Columns on `patients`; tables `patient_consents`, `patient_consent_events` | No | None |
| 039 | `039_batch1a_clinical_follow_up.sql` | Consultation draft fields + follow-up worklist | Columns on `consultation_notes`; tables `clinical_follow_up_items`, `clinical_follow_up_events` | No | None |

No unexpected destructive operations. Proceeded.

---

## 3. Drift check (pre-apply)

| Migration | Classification | Evidence |
|-----------|----------------|----------|
| 036 | **CLEANLY_MISSING** | `to_regclass` null for three tables; pricing/profile columns absent |
| 037 | **CLEANLY_MISSING** | Pre-canonical status CHECK (legacy set); no `decline_reason` |
| 038 | **CLEANLY_MISSING** | Consent tables null; next-of-kin columns absent |
| 039 | **CLEANLY_MISSING** | Follow-up tables null; consultation draft columns absent |

---

## 4. Migrations applied

Command: `node db/scripts/migrate-testing.js` (after env + identity gates).

`applied` list (canonical order):

1. `platform/043_shared_data_jobs_and_preferences.sql`
2. `blessboard/114_bb_invitation_catalogue_roles.sql`
3. `blessboard/115_activeclinic_patient_create_v202_alignment.sql`
4. `blessboard/116_freeze_legacy_user_roles.sql`
5. `blessboard/117_backfill_catalogue_assignments_from_user_roles.sql`
6. `blessboard/118_activeclinic_management_data_permissions.sql`
7. **`activeclinic/036_batch1a_services_practitioners.sql`**
8. **`activeclinic/037_batch1a_appointment_canonical_statuses.sql`**
9. **`activeclinic/038_batch1a_patient_consent_clinic_fields.sql`**
10. **`activeclinic/039_batch1a_clinical_follow_up.sql`**

Runner summary: `ok: true`, `identity_key: moovex-platform-v7`, `environment_code: testing`.

---

## 5. Post-migration ledger (`module=activeclinic`)

| Version | Filename | Status |
|---------|----------|--------|
| 035 | `035_platform_contact_inquiries.sql` | applied (pre-existing) |
| 036 | `036_batch1a_services_practitioners.sql` | **applied** 2026-09-26 |
| 037 | `037_batch1a_appointment_canonical_statuses.sql` | **applied** 2026-09-26 |
| 038 | `038_batch1a_patient_consent_clinic_fields.sql` | **applied** 2026-09-26 |
| 039 | `039_batch1a_clinical_follow_up.sql` | **applied** 2026-09-26 |

---

## 6. Post-migration schema verification

| Object | Result |
|--------|--------|
| `activeclinic.staff_weekly_availability` | **present** |
| `activeclinic.service_staff_assignments` | **present** |
| `activeclinic.staff_availability_blocks` | **present** |
| `activeclinic.clinical_follow_up_items` | **present** |
| `activeclinic.clinical_follow_up_events` | **present** |
| 037: canonical `appointments_status_check` | **present** (requested…no_show) |
| 037: `public_booking_requests.decline_reason` | **present** |
| 038: `patient_consents` / `patient_consent_events` | **present** |
| 038: `patients.next_of_kin_*` / `clinic_fields_json` | **present** |
| 039: `consultation_notes` draft text columns | **present** |

---

## 7. Application SHA

| Surface | SHA | Deployment |
|---------|-----|------------|
| `activeclinic.pronline.org` | `0014616f6161` | `moovex-platform-testing` |
| `blessboard.pronline.org` | `0014616f6161` | `moovex-platform-testing` |
| `activeclinic.org` | `03a89106e2fe` | `moovex-platform-production` |
| `blessboard.com` | `03a89106e2fe` | `moovex-platform-production` |

No application redeploy performed.

---

## 8. Hosted retest (prior P0/P1 failures)

| Case | Result |
|------|--------|
| A `POST /login` org_admin | **PASS** — 303 → `/app`, session set, follow **200** |
| B `/app` org_admin | **PASS** 200 |
| C `/app` clinic_manager | **PASS** 200 |
| D `/app` facility_admin | **PASS** 200 |
| E `/app/services` facility_admin | **PASS** 200 |
| F `/app/clinical` clinician | **PASS** 200 |
| G `/app/clinical/follow-up` clinician | **PASS** 200 |
| H `/app/clinical/referrals` clinician | **PASS** 200 (ACN20 markers) |

---

## 9. Batch 3 clinical leaves

| Leaf | Result |
|------|--------|
| ACN17 vitals | **PASS** — `200` for `demo_nurse` (requires triage). Clinician **403** is correct RBAC (not a 500). Marker `data-ac-batch3="ACN17"` present. Encounter created via start-encounter on demo patient. |
| ACN19 prescription | **PASS** — `200` for clinician; `data-ac-batch3="ACN19"`; title Prescription Editor |
| ACN20 referrals | **PASS** — `200`; Referral Management title / markers |

---

## 10. Patient portal regression

| Item | Result |
|------|--------|
| AC-P03 `/clinics/activeclinic-demo/patient/bookings` | **PASS** 200 + `AC-P03` |
| AC-P04 booking detail | **LIMITED** — no linked booking fixture (same as prior QA); bogus detail → **404** (not 500) |
| AC-P06 invoices | **PASS** 200 + `AC-P06` |
| AC-P07 profile | **PASS** 200 + `AC-P07` |
| Cross-clinic bookings | **403** (`julflona-clinic`, `prestige-demo-clinic`) |

**Patient portal: PASS** (AC-P04 fixture gap unchanged, non-blocking).

---

## 11. B1+B2 targeted regression

| Route | Role | Result |
|-------|------|--------|
| `/app` | clinician | 200 |
| `/app/services` | facility_admin | 200 |
| `/app/patients` | clinician | 200 |
| `/app/appointments` | clinician | 200 |
| `/app/clinical` | clinician | 200 |
| `/app/pharmacy` | pharmacist | 200 |
| `/app/diagnostics` | lab tech | 200 |
| `/app/billing` | billing officer / cashier | 200 |
| `/app/facilities` | org_admin / clinician | 200 |

Clinician denied pharmacy/diagnostics/billing with **403** (expected). **No unexpected 500.**

**B1+B2 targeted regression: PASS**

---

## 12. Security / isolation

| Check | Result |
|-------|--------|
| RBAC | **PASS** — cashier patients **403**; cashier billing **200**; clinician vitals **403** without triage; nurse vitals **200** |
| Tenant isolation | **PASS** — portal cross-clinic **403** |
| Facility isolation | **PASS** — no evidence of broadened facility access; facility-scoped clinical/services pages render under selected facility context |
| Patient isolation | **PASS** — portal remains clinic-scoped; cross-clinic blocked |

Migration did not broaden access.

---

## 13. Production safety

| Check | Result |
|-------|--------|
| Production DB touched | **NO** |
| Production app touched | **NO** |
| `activeclinic.org` | remains `03a89106e2fe` / `moovex-platform-production` |
| `blessboard.com` | remains `03a89106e2fe` / `moovex-platform-production` |

---

## 14. Application / deploy

| Item | Value |
|------|--------|
| Application code changed | **NO** |
| Migration SQL files changed | **NO** |
| Application redeployed | **NO** |

---

## Remaining blockers (this remediation)

**None** for the hosted staff 500 / login-500 class.

Unrelated pre-existing fixture notes (not migration blockers):

- AC-P04 detail not fully exercised (no linked booking on demo portal patient)
- Deferred AC-P05 visit-summaries unchanged
