# PHASE2_075 — Hosted approval failure fix

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 hosted testing (`blessboard.org`) — Phase2 migrations + approval error visibility  
**Constraints honored:** No database reset, truncate, reseed, or recreate; live application not auto-approved

---

## Root cause

Hosted V5 testing DB was behind the Phase2 migration chain. Pending:

| # | Filename |
|---|----------|
| 036 | `036_registration_phone_verification_attempts.sql` |
| 037 | `037_registration_email_verification_tokens.sql` |
| 038 | `038_registration_duplicate_matches.sql` |
| 039 | `039_registration_application_communications.sql` |

Missing relations blocked admin detail loaders that query those tables. More critically for approval, migration **039** also adds `rejection_category`, `reapplication_allowed`, and `rejection_notification_status` on `platform_church_registration_applications`. Admin `lockApplicationById` / `getRegistrationApplicationById` `SELECT` lists include those columns, so approval threw PostgreSQL **42703** during **`lock_application`** (prepare step), before provisioning.

`approveAndProvisionRegistrationApplication` caught the throw and returned generic `lookup_error` **without logging**, and the route mapped that to `?error=approve_failed` (“The change could not be saved”). Application stayed `duplicate_review` / `not_started`.

Phase2 verification/communication/duplicate tables are **not** part of the provisioning write path; the accidental hard dependency was the shared admin `SELECT_COLUMNS` needing 039 columns.

---

## Database identity (hosted)

| Check | Result |
|-------|--------|
| `platform.database_identity` | `blessboard-platform-v5` / `testing` |
| Deployment catalogue | `blessboard-org-v5` / `testing` / `active` |
| `GETPRO_DATABASE_URL` in process | unset |
| Target schema | `blessboard` |
| Verdict | **IDENTITY_OK** (not `WRONG_DATABASE`) |

---

## Pending migrations found

Before apply (`npm run db:status` / migrator `status()`):

- Applied: **55**
- Pending: **4**
- Latest BlessBoard applied before fix: **035** (`035_organization_growth_trial_offers.sql`)
- Exact pending:
  1. `blessboard/036_registration_phone_verification_attempts.sql`
  2. `blessboard/037_registration_email_verification_tokens.sql`
  3. `blessboard/038_registration_duplicate_matches.sql`
  4. `blessboard/039_registration_application_communications.sql`

### Table → migration matrix

| Table | Migration | In catalogue | Dependencies | Hosted before | Hosted after |
|-------|-----------|--------------|--------------|---------------|--------------|
| `registration_phone_verification_attempts` | 036 | yes | apps table, `blessboard.users` | missing / pending | applied |
| `registration_email_verification_tokens` | 037 | yes | apps table, `blessboard.users` | missing / pending | applied |
| `registration_duplicate_matches` | 038 | yes | apps table, `blessboard.users` | missing / pending | applied |
| `registration_application_communications` | 039 | yes | apps table, `blessboard.users` + rejection columns on apps | missing / pending | applied |

---

## Migrations applied

Canonical runner: `migrate()` via `DATABASE_URL` (same as `npm run db:migrate`).

Applied successfully:

1. `blessboard/036_registration_phone_verification_attempts.sql`
2. `blessboard/037_registration_email_verification_tokens.sql`
3. `blessboard/038_registration_duplicate_matches.sql`
4. `blessboard/039_registration_application_communications.sql`

After: applied **59**, pending **0**, drift **0**. Seeds skipped (already applied). No data deleted.

---

## Approval failure stage

**Exact stage:** `lock_application` (prepare approval transaction)  
**Mechanism:** `SELECT` via `SELECT_COLUMNS` referencing missing `rejection_category` (and siblings) → PG `42703` → swallowed as `lookup_error` → redirect `approve_failed`  
**Not:** provisioning org create (never reached)

---

## Code changes

| File | Change |
|------|--------|
| `src/blessboard/services/registrationApplicationsAdminService.js` | Structured approval failure log; stage tracking; classify `42703`/`42P01` as `schema_mismatch` |
| `src/platform/http/platformAdminRoutes.js` | `mapApproveError` handles `LOOKUP_ERROR`/`schema_mismatch`; approve route try/catch + safe log |
| `views/blessboard/v5/platform-admin/registration-application-detail.ejs` | Allowlisted admin flash for `schema_mismatch` |
| `docs/phase2/PHASE2_075_HOSTED_APPROVAL_FAILURE_FIX.md` | This report |

No approval-gate redesign. Verification/duplicate/communications remain advisory relative to provision.

---

## Hosted schema verification (post-migrate)

All four Phase2 tables present with PK, application FK, user FK where expected, CHECK constraints, and indexes.  

`platform_church_registration_applications` columns present:

- `rejection_category`
- `reapplication_allowed`
- `rejection_notification_status`

Target application **ff25ae45-26da-42b2-97e7-0d23873dc4b4** (read-only):

- Still exists
- `application_status`: `duplicate_review`
- `provisioning_status`: `not_started`
- `organization_id`: null  
- Phase2 tables queryable (0 rows)  
- Organization count unchanged (1) — no duplicate org created  
- Admin `getRegistrationApplicationById` succeeds including rejection columns

---

## Test results

Run locally against foundation test DB (not hosted mutate beyond migrate already done):

- Migration tooling tests
- Phase2 storage tests (phone / email / communications / duplicates)
- Registration approval route + operator approval / provisioning tests
- Registration detail loader tests
- Platform admin registration regression subset

See session final output for pass counts. PostgreSQL-backed approval path covered by existing operator-approval suite on full migration chain.

---

## Restart

**Yes — Hostinger Node.js app restart required** so workers load the approval logging / flash code changes. Schema is already live in Postgres (no restart needed for tables alone).

---

## Safe manual retest steps

1. Restart Hostinger Node.js app (`npm start` / hPanel Restart).
2. Sign in as Platform Admin on `https://blessboard.org`.
3. Open  
   `https://blessboard.org/admin/registration-applications/ff25ae45-26da-42b2-97e7-0d23873dc4b4`
4. Confirm detail page loads (phone verification / communications / duplicates sections no longer schema-error).
5. Manually click **Approve** only when ready (this prompt did **not** approve).
6. Expect redirect to organization with provision notice, or an allowlisted error flash (not a silent failure).
7. If failure recurs, check Hostinger logs for `registration_approval_failed` / `failureStage` / `pgCode` (no applicant PII).
