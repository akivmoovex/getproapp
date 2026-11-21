# V2.13.1 D20 — Execution safety hardening

Branch `V13`. HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. No commit, push, or deployment.

This phase closed the two harness blockers left by the overnight repair: the foundation bootstrap wrapper accepted the shared PostgreSQL port, and ActiveClinic fixture setup called the hosted QA helper that sets `public_booking_enabled = true`.

No database was created or modified. The shared Postgres.app instance was not contacted. Foundation bootstrap, migrations, seeds, HTTP regression, and Playwright were not executed.

## Bootstrap launch gate

`scripts/ci/v13-foundation-bootstrap.cjs` now calls `assertIsolatedBootstrapLaunch` from `tests/v13/helpers/v13IsolatedExecutionPlan.js` inside `assertV13RegressionBootstrapEnv`, before `db/scripts/lib/foundationBootstrap.js` is imported. That import is the first point that constructs a PostgreSQL pool. A rejected target never reaches it.

The gate requires all of the following. Port is necessary and not sufficient.

| Check | Required value |
| --- | --- |
| Host | `127.0.0.1` only |
| Approved port | `GETPRO_V13_ISOLATED_PG_PORT=55432`, matching the URL port |
| Shared port | `5432` rejected even when the database name is correct |
| Database | `getpro_v13_e2e_regression213101` |
| Role | `v13_regression_213101` (`postgres` and `local` are rejected) |
| Privilege declaration | `LOGIN,NOSUPERUSER,NOCREATEDB,NOCREATEROLE,NOREPLICATION,NOBYPASSRLS,NOINHERIT` |
| Instance id and cluster name | `v13-regression-213101` |
| Data directory | `<worktree>/.v13-isolated-pg/data` |
| Socket directory | `<worktree>/.v13-isolated-pg/run` |
| Shared identity | `Postgres.app`, `var-16`, `Application Support/Postgres`, and Homebrew data paths rejected |
| Write flags | `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1` |
| Instance flag | `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1` |
| Application URL | `GETPRO_DATABASE_URL` must stay unset |

The privilege string is a required declaration. This phase does not query `pg_roles` and does not connect. A live catalog check remains a future authorized step.

`db/scripts/bootstrap-foundation.js` and `npm run db:bootstrap:foundation` are unchanged. The wrapper still does not contain `CREATE DATABASE`, `CREATE ROLE`, or `require("pg")`.

The disposable-name guard in `tests/v13/helpers/v13CiDatabaseGuard.js` was not weakened and was not changed to reject port 5432 by itself. The extra rejection lives on the bootstrap launch path.

## ActiveClinic fixtures

`applyActiveClinicFixtures` no longer calls `provisionHostedAuthQaClinic`. That helper still enables public booking for its own hosted-QA callers. The V13 path does not call it and does not run `public_booking_enabled = true`.

The replacement uses existing provisioning contracts:

1. `submitAndProvisionClinicRegistration` for each synthetic clinic. Registration leaves `public_booking_enabled` at its column default, `false`.
2. A read of `activeclinic.healthcare_organizations.public_booking_enabled`. The fixture throws if the value is true, before and after the later writes.
3. `ensureDefaultDepartments`, which creates the reception and OPD department rows used by the module gates.
4. `createStaffMember`, `assignStaffToFacility`, and `assignStaffRole` at facility scope for `activeclinic_receptionist` and `activeclinic_clinician`.
5. The same facility assignment and receptionist role on the registering administrator, so a future regression session can check in without a new product permission.
6. `activeclinic_nurse` on the clinician and the registering administrator. The clinician role does not include `activeclinic.triage.record`. The existing nurse role does. This is an additional supported assignment, not a catalogue change.
7. `createFacilityServicePoint` with the receptionist as the actor. That call authorizes `activeclinic.reception.manage_queue` and facility scope. Clinic A uses `v13d19-walk-in` on `v13d19-facility-a`. Clinic B uses a different key on its own facility.

`openClinic` in `tests/v13/integration/d05RegressionRunners.js` now calls the same attachment after each HTTP registration. It was not executed. Public booking stays disabled. Coupons stay deferred.

`assertRegressionClinicOperationsPlan` rejects a plan that enables booking, omits the receptionist or clinician role, points a role at the wrong department, or omits the walk-in service point. Unauthorized `applyActiveClinicFixtures` still throws `V13_FIXTURE_HOLD` before any query.

## Sixteen regression workflows

Reviewed against the fixture plan and the existing source contracts. None of these workflows were executed.

| Workflow | Contract held |
| --- | --- |
| AC-REG-01, BB-REG-07 | Overnight registration fixes unchanged |
| AC-AUTH-04 | Recovery plan uses `testing-outbox` and `liveEmail: false` |
| BB-AUTH-04 | Member plan uses the test OTP provider and does not expose the code |
| BB-MEM-01, BB-MEM-02 | HQ add-member form keeps `data-bb-hq-add-member-form` and the shell CSRF field |
| AC-WEB-08, AC-WEB-09, BB-WEB-08 | Theme keys remain `ac.family-wellness-mint` and `bb.community`; `selectAppliedTheme` still chooses the published theme for live rendering |
| BB-WEB-09, BB-WEB-10 | Unchanged overnight content fixes |
| BB-ANN-01, BB-ANN-02 | Public announcement query still requires `audience_key = 'public'` and `status = 'published'` |
| AC-REC-02 | Walk-in form and service-point read-back remain in the runner; fixture provisions a facility-local point |
| AC-REC-03 | Vitals runner still requires persisted `72 bpm` read-back; display formatter unchanged |
| AC-PUB-01 | `publicBookingEnabled !== true`; coupon and voucher fields remain deferred |

## Safe validation

Command, with database URLs and write/browser flags unset:

`node --test --test-concurrency=1 --test-timeout=30000 tests/v13/contract/*.test.js tests/v13/unit/*.test.js`

Result: 432 passed, 0 failed, 0 skipped. The previous baseline was 427. The five new D20 contract tests account for the increase.

`node --check` passed for:

- `scripts/ci/v13-foundation-bootstrap.cjs`
- `tests/v13/helpers/v13IsolatedExecutionPlan.js`
- `tests/v13/fixtures/v13SyntheticFixtures.js`
- `tests/v13/integration/d05RegressionRunners.js`
- `tests/v13/contract/d11-foundation-bootstrap.test.js`
- `tests/v13/contract/d18-isolated-execution-plan.test.js`
- `tests/v13/contract/d20-execution-safety.test.js`

D04 and D05 HTTP tests were not loaded. Playwright was not launched.

## Files changed in this phase

- `scripts/ci/v13-foundation-bootstrap.cjs`
- `tests/v13/helpers/v13IsolatedExecutionPlan.js`
- `tests/v13/fixtures/v13SyntheticFixtures.js`
- `tests/v13/integration/d05RegressionRunners.js`
- `tests/v13/contract/d11-foundation-bootstrap.test.js`
- `tests/v13/contract/d18-isolated-execution-plan.test.js`
- `tests/v13/contract/d20-execution-safety.test.js`
- `docs/qa/V2131_D20_EXECUTION_SAFETY_HARDENING.md`

The 89 overnight paths remain. No product permission, OTP production path, CI workflow, or production bootstrap file was edited. Unexpected files: none.

## Unresolved isolation and future authorization

The dedicated loopback instance does not exist. Port 55432 was not started. The role `v13_regression_213101` was not created. `getpro_v13_e2e_regression213101` was not created. Privilege attributes are declared, not read from the catalog.

A later phase may execute only after all of the following are true, and only under a separate authorization:

- A PostgreSQL 16 instance whose data directory is `<worktree>/.v13-isolated-pg/data` and whose socket directory is `<worktree>/.v13-isolated-pg/run`.
- Listen address `127.0.0.1` and port `55432`, with SCRAM authentication and no trust or remote `pg_hba` entries.
- A login role with the declared non-superuser attributes, able to use only the disposable database.
- The exact URL `postgresql://v13_regression_213101@127.0.0.1:55432/getpro_v13_e2e_regression213101`.
- `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1`, `GETPRO_V13_ALLOW_DB_WRITES=1`, `GETPRO_V13_DB_STAGES_AUTHORIZED=1`, `FOUNDATION_ALLOW_LOCALHOST=1`, and `GETPRO_PG_SSL=off`.
- `GETPRO_DATABASE_URL` unset.
- A live `pg_roles` check against that instance before bootstrap.
- Separate flags `GETPRO_V13_HTTP_AUTHORIZED=1` and `GETPRO_V13_BROWSER_AUTHORIZED=1` before those suites.

Until that run, receptionist, clinician, nurse, department, and service-point rows are source contracts only. `createFacilityServicePoint` persists `accepts_scheduled = true` even though the fixture plan records `acceptsScheduled: false`. Walk-in acceptance is still true, and public booking is not enabled. If OTP activation is `ACTIVE`, `assignStaffRole` fail-closes with `otp_required`; the fixture does not bypass that gate.

```
FINAL=V2131_D20_EXECUTION_SAFETY
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
OVERNIGHT_FIXES_PRESERVED=YES
BOOTSTRAP_PORT_5432_REJECTED=YES
ISOLATED_INSTANCE_VERIFICATION=DECLARED_NOT_CONNECTED
SHARED_POSTGRES_ACCESS=NO
AC_PUBLIC_BOOKING_DEFAULT=DISABLED
RECEPTION_ROLE_FIXTURE=SOURCE_CONTRACT_NOT_EXECUTED
CLINICAL_ROLE_FIXTURE=SOURCE_CONTRACT_NOT_EXECUTED
SERVICE_POINT_FIXTURE=SOURCE_CONTRACT_NOT_EXECUTED
SAFE_TESTS_PASSED=432
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
FILES_CHANGED=8
UNEXPECTED_FILES=
REPORT_PATH=docs/qa/V2131_D20_EXECUTION_SAFETY_HARDENING.md
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
DEPLOYMENT=NOT_PERFORMED
BLOCKERS=Isolated instance not created; pg_roles not queried; bootstrap, HTTP, and browser not run; fixture rows not inserted; clinician role lacks triage.record so the fixture also assigns the existing nurse role; enabled booking and coupons remain deferred
```
