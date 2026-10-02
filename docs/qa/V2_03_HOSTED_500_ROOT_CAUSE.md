# ActiveClinic V2.03 — Hosted P0/P1 500 root cause

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_HOSTED_500_ROOT_CAUSE` |
| **Date** | 2026-09-26 |
| **Product SHA diagnosed** | `0014616f6161b839344039ef7ed44cebeffb9f27` |
| **Local HEAD at diagnosis** | `3f07c5d64a38b240b047538ed7f5f57faf2df133` (docs-only freeze record — not an app release) |
| **Hosts / deployment** | `activeclinic.pronline.org` · `moovex-platform-testing` · DB identity `moovex-platform-v7` / `testing` |
| **Production** | **UNTOUCHED** (`activeclinic.org` / `moovex-platform-production`) |
| **Freeze verdict** | Left unchanged: `V2_03_RELEASE_CANDIDATE_FREEZE_BLOCKED` |

## Verdict

**ONE_ROOT_CAUSE (hosted testing schema lag):** ActiveClinic Batch 1A migrations `036`–`039` exist in the repository and were already required by code at the prior Batch 2 tip `6fb754eb`, but they were **never applied** to the shared testing database ledger (activeclinic module stops at `035`).

All P0/P1 staff 500s reproduce as PostgreSQL `42P01` (undefined_table) against tables created by those migrations. No application code change is required to clear these blockers. No speculative fail-soft / RBAC / auth rewrite.

**Remediation type:** `DB_ONLY` — apply existing migrations to **testing only** via the controlled wrapper `db/scripts/migrate-testing.js` (identity-gated to `moovex-platform-v7` / `testing`).

**Remediation status (2026-09-26):** Testing migrations `036`–`039` (plus other pending testing ledger files in canonical order) were applied via `migrate-testing.js`. Hosted P0/P1 500 retests **PASS**. See [`V2_03_TESTING_DB_036_039_REMEDIATION.md`](./V2_03_TESTING_DB_036_039_REMEDIATION.md). Marker: `V2_03_TESTING_DB_REMEDIATION_PASS`.

**Freeze verdict:** Left unchanged in this remediation (`V2_03_RELEASE_CANDIDATE_FREEZE_BLOCKED` is a separate release gate).

---

## Method

1. Hosted HTML error pages only expose request IDs (safe V5 handler strips stacks in production).
2. Reproduced against the **same testing `DATABASE_URL`** with `NODE_ENV=development` so `blessboard_v5_error` logs include SQLSTATE + message.
3. Confirmed `platform.schema_migrations` for `module=activeclinic`: versions `001`–`035` applied; **`036`–`039` missing**.
4. Confirmed `to_regclass` null for `staff_weekly_availability`, `service_staff_assignments`, `clinical_follow_up_items`.
5. Compared stack-owning files / migrations between `6fb754eb` and `0014616f`: Batch 1A schema files and queries already present at last known working tip → **HOSTED_DATA_SCHEMA_DRIFT / EXPOSED_PREEXISTING_BUG**, not introduced by Batch 3.

---

## Failure evidence (A–H)

| ID | Path | Role | HTTP | Error class | SQLSTATE / code | Exception message | Owning path |
|----|------|------|------|-------------|-----------------|-------------------|-------------|
| A | `GET /app` | org_admin | 500 | `error` (pg) | `42P01` | relation `"activeclinic.staff_weekly_availability"` does not exist | `loadOrganizationClinicSetup` → `servicePractitionerConfigRepository.listWeeklyAvailability` |
| B | `GET /app` | clinic_manager | 500 | same | `42P01` | same | same |
| C | `GET /app` | facility_admin | 500 | same | `42P01` | same | same |
| D | `GET /app/clinical` | clinician | 500 | same | `42P01` | relation `"activeclinic.clinical_follow_up_items"` does not exist | clinical queue / follow-up loaders |
| E | `GET /app/clinical/follow-up` | clinician | 500 | same | `42P01` | same | `activeClinicClinicalFollowUpService` / clinical screens |
| F | `GET /app/clinical/referrals` | clinician | 500 | same | `42P01` | same | referrals screen uses follow-up items |
| G | `GET /app/services` | facility_admin | 500 | same | `42P01` | relation `"activeclinic.service_staff_assignments"` does not exist | ops catalogue / `servicePractitionerConfigRepository` |
| H | `POST /login` | org_admin (representative) | 500 | same | `42P01` | relation `"activeclinic.staff_weekly_availability"` does not exist | post-auth `resolvePostLoginPath` → AC onboarding adapter → `loadOrganizationClinicSetup` |

### Hosted login probe (H)

- `POST /login` returns **500 HTML** (`X-Request-Id` example: `5d62ba91b2a37ccb8043dd79`).
- Session cookie **is set** (`moovex_platform_testing_sid` present after the failed response).
- Subsequent `GET /app` with that session also **500**.
- Conclusion: **authentication succeeds**; **session persistence succeeds**; failure is in **post-login destination resolution** (`activeClinicPostLoginPath` / onboarding), not credential verification. Do not rewrite authentication.

Local development log for the same failure:

```text
event=blessboard_v5_error method=POST path=/login status=500 code=42P01
message=relation "activeclinic.staff_weekly_availability" does not exist
```

---

## Root-cause table

| Issue | Actual exception | Root cause | Owning file(s) | Introduced by | Fix type | Status |
|-------|------------------|------------|----------------|---------------|----------|--------|
| P0-1 `/app` (admin roles) | `42P01` `staff_weekly_availability` | Testing DB missing `activeclinic/036_batch1a_services_practitioners.sql` | `loadActiveClinicSettingsScreens.js`, `servicePractitionerConfigRepository.js`, `loadActiveClinicDashboardHome.js` | **HOSTED_DATA_SCHEMA_DRIFT** (required since Batch 1A; present at `6fb754eb`) | **TESTING_DB_MIGRATION** | Proven — not applied this prompt |
| P0-2 clinical / follow-up / referrals | `42P01` `clinical_follow_up_items` | Testing DB missing `activeclinic/039_batch1a_clinical_follow_up.sql` | `activeClinicClinicalFollowUpService.js`, `loadActiveClinicClinicalScreens.js`, clinical routes | **HOSTED_DATA_SCHEMA_DRIFT** (Batch 1A ACN14–16; Batch 3 only adds presentation) | **TESTING_DB_MIGRATION** | Proven — not applied this prompt |
| P0-3 `/app/services` | `42P01` `service_staff_assignments` | Same missing `036` as P0-1 | `activeClinicOpsCatalogueService.js`, `servicePractitionerConfigRepository.js` | **HOSTED_DATA_SCHEMA_DRIFT** | **TESTING_DB_MIGRATION** | Proven — not applied this prompt |
| P1 `POST /login` 500 HTML | `42P01` `staff_weekly_availability` after session cookie issued | Same missing `036`; onboarding `listSteps` calls clinic setup after auth | `activeClinicAuthRoutes.js` → `resolvePostLoginPath` → `activeClinicOnboardingAdapter.js` | **HOSTED_DATA_SCHEMA_DRIFT** (same as P0-1) | **TESTING_DB_MIGRATION** (optional later: login error-handling polish only after DB fix) | Proven — auth healthy |

### Batch 3 relationship

| Area | Classification |
|------|----------------|
| Missing tables / migrations | **UNRELATED_TO_BATCH3** / **HOSTED_DATA_SCHEMA_DRIFT** — migrations and queries existed at `6fb754eb` |
| Clinical presentation (ACN17/19/20) | Batch 3 UI/routes sit on Batch 1A follow-up tables; hosted 500 is schema lag, not a Batch 3 logic regression |
| Login 500 HTML | Same schema lag surfaced through onboarding redirect path |

---

## Schema / migration status (read-only)

| Migration | In repo at `6fb754eb` | In repo at `0014616f` | Applied on testing ledger | Creates (relevant) |
|-----------|----------------------|------------------------|---------------------------|--------------------|
| `activeclinic/036_batch1a_services_practitioners.sql` | yes | yes | **NO** | `staff_weekly_availability`, `service_staff_assignments`, service pricing columns |
| `activeclinic/037_batch1a_appointment_canonical_statuses.sql` | yes | yes | **NO** | appointment status constraints |
| `activeclinic/038_batch1a_patient_consent_clinic_fields.sql` | yes | yes | **NO** | consent fields |
| `activeclinic/039_batch1a_clinical_follow_up.sql` | yes | yes | **NO** | `clinical_follow_up_items` |

**Other pending on testing (not required to explain these 500s, but would apply with full `migrate-testing`):**

- `platform/043_shared_data_jobs_and_preferences.sql`
- `blessboard/114` … `118` (catalogue / V2.02 alignment / management data permissions)

Prefer applying the **existing** files via `migrate-testing.js` over inventing new migrations. Do **not** invent fallbacks that hide `42P01`.

---

## Application changes

| Item | Value |
|------|--------|
| Application files changed | **NONE** |
| New application commit | **NONE** |
| DB changes (testing only, later remediation) | `036`–`039` (+ pending platform/blessboard ledger peers) via `migrate-testing.js` |
| Production DB touched | **NO** |

---

## Tests

Diagnosis prompt: no app fix; local suite not re-run as a post-fix gate.

**After testing DB remediation:** hosted A–H, Batch 3 clinical leaves, portal AC-P03/06/07, B1+B2 targeted routes, and RBAC/isolation probes — **PASS**. Details in [`V2_03_TESTING_DB_036_039_REMEDIATION.md`](./V2_03_TESTING_DB_036_039_REMEDIATION.md).

---

## Hosted fix strategy

**Completed (2026-09-26):** `migrate-testing.js` applied pending testing migrations including activeclinic `036`–`039`. Hosted app SHA remained `0014616f6161` (no redeploy). Production untouched.

No login error-handling change required — post-login destination now succeeds.

---

## Production

**Production untouched.** No production migrate, no production deploy, no production identity change.
