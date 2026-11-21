# V2.13.1 D25 — Synthetic regression fixtures

Branch `V13`. HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. No commit, push, or deployment.

Fixtures were written only on `127.0.0.1:55432`, database `getpro_v13_e2e_regression213101`, role `v13_regression_213101`. Port `5432` was not contacted. The run marker is `d25fixture01`. The sanitized manifest is the gitignored file `.v13-isolated-pg/d25-manifest.json`.

## Isolation

Live session before the writes:

| Check | Value |
| --- | --- |
| Database | `getpro_v13_e2e_regression213101` |
| Role | `v13_regression_213101` |
| Port | `55432` |
| Version | PostgreSQL 16.9 |
| Data directory | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` |
| Owner | `v13_regression_213101` |
| Superuser, createdb, createrole, replication, bypassrls, inherit | all false |
| Memberships | 0 |
| Authentication | SCRAM-SHA-256, no trust rule |
| Listen | `127.0.0.1` |
| Organizations before the run | 0 |
| `public_booking_enabled` true | 0 |
| Ledger | platform 47, blessboard 130, activeclinic 42, getpro 1, ngo 1, seeds 11 |

The same role attributes, owner, membership count, and ledger counts are unchanged after provisioning. The listener is still PID `42963` on `127.0.0.1:55432`.

Both write flags and the isolated-instance flag were set only for this process. `GETPRO_DATABASE_URL` stayed unset. Browser and HTTP authorization were not set. The connection string named the isolated host, port, database, and role. The password was read from the gitignored credential file and was not written to the manifest or this report.

## What was provisioned

BlessBoard, both run-owned:

- Churches `v13d19-church-a` and `v13d19-church-b`, each with an `hq` branch.
- Administrators `admin-church-a@v13d19.example` and `admin-church-b@v13d19.example`.
- Stored role keys: `church_system_administrator` and `organisation_administrator` on each church. `church_hq_admin` is not a stored assignment key.
- One member on church A, phone normalized from `977000111`. An invalid phone was rejected and not stored. A second member with the same phone was not created.
- One testing OTP row for password recovery. The test provider stores the code in process memory. The code is not in this report.
- Draft and published sermon, draft and published event, draft and published announcement, and one private PNG attachment on church A.
- Church B has no sermons, events, announcements, or members.

The first church insert failed closed with `branch_capacity_check_failed` because the fixture plan skips the default subscription. The platform organization had already committed. A supported `provisionPlatformTenant` call then assigned the default BlessBoard plan, and `provisionBlessBoardChurch` created both churches. No table was repaired by hand.

ActiveClinic, run-owned:

- Clinics stored as `v13-d19-clinic-a` and `v13-d19-clinic-b` (the registration service hyphenates the requested keys). Each has a facility.
- Reception and OPD departments, plus the product’s other default departments, on both facilities.
- Receptionist role with `activeclinic.reception.check_in`, `activeclinic.appointment.check_in`, and `activeclinic.reception.manage_queue`.
- Clinician role on the clinical staff member. That role does not include `activeclinic.triage.record`.
- Nurse role on the clinical staff member and on the clinic administrator, which is what `attachRegressionClinicOperations` assigns. The nurse role includes `activeclinic.triage.record`.
- Walk-in service points `v13d19-walk-in` and `v13d19-walk-in-b`. Both accept walk-ins. Both also store `accepts_scheduled = true`. The fixture plan asked for scheduled intake to stay off. The supported service-point function persists the column default, and this phase did not change that function or the rows.
- One patient on clinic A, linked to that clinic. A second registration with the same phone returned `duplicate_warning` and did not insert another patient.
- Service `v13d19-consult` with `public_bookable = false`.
- One walk-in arrival checked in by the receptionist.
- Website instances for both products. Draft themes are `bb.community` on the BlessBoard instance and `ac.family-wellness-mint` on the ActiveClinic instance. The other product’s theme was not saved onto either instance.
- Staff recovery for `admin-a@v13d19.example` used the testing capture adapter. No live email or SMS was selected.

`applyActiveClinicFixtures` throws before staff attach because each clinic spec does not carry `publicBookingEnabled: false`, and `attachRegressionClinicOperations` refuses a spec that is not explicitly false. D25 called that attach function with the flag set to false and with the live facility ids. Booking stayed false. The fixture source file was not edited.

## Public booking

Every healthcare organization has `public_booking_enabled = false`, including the unexpected third clinic below. No coupon table exists. The consultation service is not publicly bookable.

## Failures left in place

BlessBoard public pages were not created. `provisionEmptyPublicPages` rolled back on `null value in column "church_id" of relation "website_structured_drafts"`. `blessboard.public_pages` and `blessboard.page_sections` are empty. Platform website instances exist and are `coming_soon`, with the draft themes above. The table was not repaired.

A negative registration with mismatched passwords was rejected and did not insert a clinic. A second registration that reused `admin-a@v13d19.example` was accepted and created `v13-d25-reuse-clinic`. That clinic has a facility, booking disabled, and no service point. It was not dropped.

## Ledger and privileges

`platform.schema_migrations` is still 221 product migrations and 11 seeds. No migration or seed was replayed. The regression role is still not a superuser and still has no createdb, createrole, replication, bypassrls, inherit, or memberships.

## Scenario prerequisites

HTTP and browser scenarios were not run. The rows above are the data those scenarios need:

| Bug | Prerequisite |
| --- | --- |
| AC-REG-01 | Mismatched password registration did not insert a clinic |
| BB-REG-07 | Occupying phone is stored once; a duplicate was not inserted |
| AC-AUTH-04 | Testing recovery capture for the clinic administrator |
| BB-AUTH-04 | Testing OTP row for password recovery |
| BB-MEM-01 | Member, phone, and HQ branch on church A |
| BB-MEM-02 | Same member, created through the staff add-member flow |
| AC-WEB-08 | ActiveClinic website instance and draft section path completed |
| AC-WEB-09 | ActiveClinic theme draft is `ac.family-wellness-mint` |
| BB-WEB-08 | BlessBoard theme draft is `bb.community` |
| BB-WEB-09 | Draft and published sermons on church A only |
| BB-WEB-10 | Draft and published events on church A only |
| BB-ANN-01 | Draft and published announcements on church A only |
| BB-ANN-02 | Private PNG attachment on the published announcement |
| AC-REC-02 | Reception department, receptionist queue permissions, walk-in service point, walk-in arrival |
| AC-REC-03 | OPD department and nurse `activeclinic.triage.record` |
| AC-PUB-01 | Booking disabled on every clinic; no coupon rows |

## Validation

Database-free contract and unit tests, with database URLs and write flags unset: 437 passed, 0 failed. That matches the previous baseline.

Cleanup of `v13d19-*`, `v13-d19-*`, and `v13-d25-reuse-clinic` is a later authorization. This phase did not truncate, drop, or reset anything.

```
FINAL=V2131_D25_SYNTHETIC_FIXTURES
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
ISOLATED_INSTANCE_VERIFIED=YES
DATABASE=getpro_v13_e2e_regression213101
HOST=127.0.0.1
PORT=55432
ROLE=v13_regression_213101
ROLE_PRIVILEGES_VERIFIED=YES
FOUNDATION_MIGRATIONS_PRESERVED=221
SEEDS_PRESERVED=11
RUN_MARKER=d25fixture01
BB_FIXTURE_GROUPS=churches,hq_roles,member,invalid_phone,otp,sermons,events,announcements,theme_draft
AC_FIXTURE_GROUPS=clinics,facilities,departments,receptionist,clinician,nurse,service_points,patient,walk_in,service,website,recovery
FIXTURES_CREATED=2 churches, 2 planned clinics, 1 member, 1 otp, 2 sermons, 2 events, 2 announcements, 1 attachment, 1 patient, 1 walk-in, 1 service, 2 service points
FIXTURES_FAILED=2
FIXTURE_MANIFEST=.v13-isolated-pg/d25-manifest.json
TENANT_ISOLATION=PASS
FACILITY_ISOLATION=PASS
RECEPTION_ROLE_VERIFIED=YES
NURSE_TRIAGE_PERMISSION_VERIFIED=YES
SERVICE_POINT_VERIFIED=YES
PUBLIC_BOOKING_ENABLED=NO
OTP_PROVIDER=TEST_ONLY
REGRESSION_SCENARIOS_READY=AC-REG-01,BB-REG-07,AC-AUTH-04,BB-AUTH-04,BB-MEM-01,BB-MEM-02,AC-WEB-08,AC-WEB-09,BB-WEB-08,BB-WEB-09,BB-WEB-10,BB-ANN-01,BB-ANN-02,AC-REC-02,AC-REC-03,AC-PUB-01
REGRESSION_SCENARIOS_BLOCKED=
SAFE_TESTS_PASSED=437
SAFE_TESTS_FAILED=0
HTTP_REGRESSIONS=NOT_RUN
BROWSER_REGRESSIONS=NOT_RUN
SHARED_POSTGRES_TOUCHED=NO
DATABASE_RESET=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
DEPLOYMENT=NOT_PERFORMED
FILES_CHANGED=1
UNEXPECTED_FILES=
REPORT_PATH=docs/qa/V2131_D25_SYNTHETIC_FIXTURE_PROVISIONING.md
D26_HTTP_AUTHORIZATION_REQUIRED=YES
BLOCKERS=BlessBoard public pages rolled back on website_structured_drafts.church_id; credential reuse created v13-d25-reuse-clinic with booking still false; applyActiveClinicFixtures still throws unless the clinic spec sets publicBookingEnabled false; service points store accepts_scheduled true
```
