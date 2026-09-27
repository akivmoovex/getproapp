# V10 PL09 — Fresh DB Bootstrap from Zero Application Data

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_FRESH_DB_BOOTSTRAP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` (`21ba521c`) |
| **Prerequisites** | PL01–PL08 PASS |
| **Target DB** | **Ephemeral local only** (`blessboard_ft_*` via `foundationDb`) |
| **QA DB** | **NOT TOUCHED** (`DATABASE_URL` / `TEST_DATABASE_URL` unset for all PL09 runs) |
| **Production DB** | **NOT TOUCHED** |
| **Historical data copy** | **NONE** |
| **Verdict** | **`V10_FRESH_DB_BOOTSTRAP_PASS`** |
| **QA reset gate** | **`QA_RESET_AUTHORIZED: YES`** (PL10 only; does not itself reset) |

---

## Hard constraints observed

- Disposable isolated local Postgres only (`localhost` / `blessboard_ft_*`)
- Canonical migrate strategy **B** (ordered migrations + seeds)
- Fresh BB tenant via `provisionPlatformTenant` → `provisionBlessBoardChurch` → `createBlessBoardUser` → `assignBlessBoardRole`
- Fresh AC tenant via `submitAndProvisionClinicRegistration`
- No QA wipe, truncate, drop, or hosted URL inheritance

Harness: `tests/v10-pl09-fresh-db-bootstrap.test.js`

---

## 1–2 Migration count / ceiling + identity

| Metric | Value |
|--------|-------|
| Strategy | **B** — cleaned ordered migrations |
| Discovered / applied migrations | **205 / 205** |
| Seeds applied | **9 / 9** |
| Skipped | **0** |
| Ownership orphans | **0** |
| Identity key | `moovex-platform-v7` |
| Environment | `testing` |
| `verifyCanonicalFreshSchema` | **ok** |

| Module | Ceiling version | Ceiling filename |
|--------|-----------------|------------------|
| platform | **043** | `043_shared_data_jobs_and_preferences.sql` |
| blessboard | **118** | `118_activeclinic_management_data_permissions.sql` |
| activeclinic | **042** | `042_patient_visit_summary_releases.sql` |
| getpro | **001** | `001_create_getpro_schema.sql` |
| ngo | **001** | `001_create_ngo_schema.sql` |

Evidence capture: ephemeral migrate meta + PL09 suite test `1–2`.

---

## Schema verification

**AC V2.03 core (tables present after fresh migrate):**

| Area | Tables asserted |
|------|-----------------|
| patients | `patients`, `patient_registrations`, `patient_identifiers` |
| appointments | `appointments`, `appointment_service_types`, `appointment_status_events` |
| clinical | `encounters`, `clinical_orders`, `clinical_diagnoses`, `clinical_follow_up_items` |
| pharmacy | `pharmacy_prescriptions`, `inventory_items`, `dispense_events` |
| diagnostics | `laboratory_requests`, `radiology_requests`, `laboratory_results` |
| billing | `invoices`, `payments`, `patient_charges`, `cashier_sessions` |
| rooms | `facility_rooms` |
| clinical documents | `clinical_documents`, `clinical_document_events` |
| visit summary/release | `patient_visit_summary_releases` |

**BB core domain:** `churches`, `branches`, `members`, `roles`, `permissions`, `user_role_assignments`, `media_assets`, `public_pages`, `website_publication_versions`, `website_inline_field_drafts`

---

## BB bootstrap

| Step | Result |
|------|--------|
| `provisionPlatformTenant` (`pl09-bb`) | **PASS** |
| `provisionBlessBoardChurch` + HQ branch | **PASS** |
| Settings / website foundation / public pages | **PASS** |
| `createBlessBoardUser` + `assignBlessBoardRole` (`organisation_administrator`) | **PASS** |
| Effective permissions non-empty | **PASS** |
| Draft → edit → publish → version → restore | **PASS** (`publishWebsiteDrafts` + `restoreAndPublishCurrentVersion`) |
| Media (`blessboard.media_assets`, visibility `public`) | **PASS** |

---

## AC bootstrap

| Step | Result |
|------|--------|
| `submitAndProvisionClinicRegistration` (`pl09-ac`) | **PASS** |
| Users / org / facility scopes from normal provision | **PASS** |
| Platform website draft → edit → publish → version → restore | **PASS** |
| Media (`website_media` / platform media service) | **PASS** |

---

## Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pl09-fresh-db-bootstrap.test.js` | **9/9 PASS** |
| Ephemeral migrate identity + schema meta | **PASS** (205 + 9) |
| Isolation / RBAC batch (below) | **45/45 PASS** |

Isolation / RBAC (ephemeral; `DATABASE_URL` unset):

- `tests/v8-tenant-product-isolation.test.js`
- `tests/v8-shared-rbac-tenant-isolation.test.js`
- `tests/v8-environment-isolation.test.js`
- `tests/activeclinic-batch2-rbac-isolation.test.js`
- `tests/blessboard-p0-publish-auth.test.js`

---

## QA reset authorization

```text
V10_FRESH_DB_BOOTSTRAP_PASS
QA_RESET_AUTHORIZED: YES
```

**Meaning:** PL10 may reset **TESTING/QA only** after explicit operator confirmation (`QA_RESET_AUTHORIZED: YES` remains a deliberate PL10 gate — this document does not perform the reset).

**Still denied:** production DB reset/deploy; force-push; rewrite of applied migration history.

---

## Required marker

```text
V10_FRESH_DB_BOOTSTRAP_PASS

Migration: 205 applied / ceiling platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
Identity: moovex-platform-v7 / testing
BB bootstrap: PASS (provision + roles + website + media)
AC bootstrap: PASS (registration provision + website + media)
Schema: AC V2.03 core + BB core PASS
Isolation/RBAC: 45/45 PASS
QA DB: NOT TOUCHED
Prod DB: NOT TOUCHED

QA_RESET_AUTHORIZED: YES
```
