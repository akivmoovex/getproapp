# Safe change manifest

This stage changed no product file.

## Safe to edit for tests and reports

- `tests/v13/unit/` and `tests/v13/contract/` when the assertion matches a contract in `APPROVAL_BOUNDARY.md`.
- `QA/V213/AC_OVERNIGHT/` reports.
- Do not add an integration or browser file that can pass while its gate is closed.

## Safe to edit only for a proven bug in an existing contract

Touch the smallest file that already implements the contract. Do not add a column, a role, or a state.

- `src/platform/http/platformAdminRoutes.js` for the AC-05 guards. Do not remove `requireApex` or `requirePlatformAdmin`.
- `src/platform/http/v5Csrf.js` and `src/platform/session/sharedSessionSecurity.js` for CSRF and session signing.
- `src/activeclinic/http/activeClinicPatientPortalRoutes.js` so registration still does not issue a session.
- `src/activeclinic/services/activeClinicAppointmentService.js` so staff overlap stays before insert.
- `src/platform/person/duplicate/duplicatePolicies.js` so no action becomes a merge.
- `src/activeclinic/services/activeClinicClinicalService.js` so signed notes stay immutable in place.
- `src/activeclinic/services/activeClinicBillingService.js` so a repeated key still rolls back before insert.
- `src/platform/otp/` so delivery stays inactive and `1234` stays testing-only.
- `src/platform/rbac/sharedTenantScope.js` so a forged tenant id still fails.

## Not safe

- `db/migrations/**` and any new `048_otp_challenges.sql`.
- Role catalogue changes that grant merge, reversal, or clinical write.
- BlessBoard files, if the change would read `activeclinic.patients` or grant a clinical permission.
- `src/startup/productionStartupChecks.js` and deployment profile production settings.
- `.github/workflows/ci.yml` and the `if: ${{ false }}` holds on the V13 workflows.
- Encounter status checks, order status checks, and pharmacy substitution behavior.

Schema dependencies that block later work, and must not be created now: a merge lineage table, an encounter-state migration, a capacity constraint, an outbox table, a legal-hold column, and `platform.otp_challenges`.

Browser and database prerequisites, all closed: both database write flags, the local database-name guard, `E2E_DATABASE_URL` for browser, and `GETPRO_V13_BROWSER_AUTHORIZED=1`. AC-05 also needs a real lower-privilege session. None of those were set.
