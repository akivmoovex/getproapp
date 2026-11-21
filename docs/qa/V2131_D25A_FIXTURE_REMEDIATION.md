# V2.13.1 D25A — Fixture contract remediation

Branch `V13`. HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. No database writes, commit, push, or deployment.

The isolated listener is still PID `42963` on `127.0.0.1:55432`. The ledger is still platform 47, BlessBoard 130, ActiveClinic 42, GetPro 1, NGO 1, and seeds 11. The regression role is unchanged.

## BlessBoard public pages

The failed insert was the BlessBoard add-section path, not `provisionEmptyPublicPages`. `addBlessBoardSection` writes `blessboard.website_structured_drafts` and binds `church_id` from the caller. The D25 caller built that request with an organization id and no church id. PostgreSQL rejected the null `church_id` and rolled the statement back. `provisionEmptyPublicPages` was never reached, so `blessboard.public_pages` and `blessboard.website_structured_drafts` are still empty. There is no null-church row left behind.

The product insert already requires the column. The fixture now refuses to build a BlessBoard website section unless it has its organization id and its own church id. A section aimed at the other church is rejected before any database call. The section payload stays unpublished and uses the supported `plain_text` type. The failed insert was not run again.

Church A still has a platform website instance in `coming_soon` with draft theme `bb.community`. Church B’s instance has no theme row. That theme split is intact.

## Extra clinic

`v13-d25-reuse-clinic` is an expected multi-clinic reuse, not a duplicate identity.

Registration reuses an existing login when the password matches and the identity already belongs to another clinic. It does not create a second `platform.identities` row, and it does not overwrite the password hash. A password mismatch does not create a clinic. The same clinic name is treated as already provisioned.

Read-only evidence:

| Organization | Identity | Booking |
| --- | --- | --- |
| `v13-d19-clinic-a` | `c974c4b3-a341-417c-b455-455250632a14` | false |
| `v13-d25-reuse-clinic` | same identity | false |
| `v13-d19-clinic-b` | a different identity | false |

There is one identity for `admin-a@v13d19.example` and two registration applications for that email. Clinic B has its own identity and one application. The fixture expectation that the matching-password second clinic should be rejected was wrong. The registration policy was not changed. The clinic was not deleted. The D25 manifest now classifies it as `EXPECTED_MULTI_CLINIC_REUSE`.

## Public booking and service points

`applyActiveClinicFixtures` now passes `publicBookingEnabled: false` into `attachRegressionClinicOperations` and throws if that flag is not false. It still does not call the hosted QA helper and does not set the booking column to true.

Every healthcare organization has `public_booking_enabled = false`. `v13d19-consult` has `public_bookable = false` and `public_website_visible = false`. Both service points accept walk-ins and also store `accepts_scheduled = true`. That column is the service-point intake flag. It does not turn on `public_booking_enabled` or `public_bookable`. Production booking defaults were not changed.

Receptionist permissions on clinic A include `activeclinic.reception.check_in` and `activeclinic.reception.manage_queue`. The nurse role includes `activeclinic.triage.record`. The clinician role does not.

## Scenario readiness

HTTP runners create their own stamped churches and clinics. The rows below are the persisted evidence those runners do not have to invent.

| Bug | Persisted evidence | HTTP creates its own records | Status |
| --- | --- | --- | --- |
| AC-REG-01 | Mismatch does not insert; matching password reuses one identity | Yes | READY |
| BB-REG-07 | One occupying member phone on church A | Yes | READY |
| AC-AUTH-04 | Testing recovery capture; one shared identity | Yes | READY |
| BB-AUTH-04 | One testing OTP row | Yes | READY |
| BB-MEM-01 | Member, phone, and HQ branch on church A | Yes | READY |
| BB-MEM-02 | That member was created through the staff flow | Yes | READY |
| AC-WEB-08 | Clinic website instances and starter section content | Yes | READY |
| AC-WEB-09 | ActiveClinic draft theme `ac.family-wellness-mint` | Yes | READY |
| BB-WEB-08 | BlessBoard draft theme `bb.community`; public page section absent | Yes | PARTIAL |
| BB-WEB-09 | Draft and published sermons on church A only | Yes | READY |
| BB-WEB-10 | Draft and published events on church A only | Yes | READY |
| BB-ANN-01 | Draft and published announcements on church A only | Yes | READY |
| BB-ANN-02 | One private attachment on church A | Yes | READY |
| AC-REC-02 | Receptionist queue permissions, walk-in points, one arrival | Yes | READY |
| AC-REC-03 | OPD department and nurse triage permission | Yes | READY |
| AC-PUB-01 | Booking disabled on all three clinics; no public service | Yes | READY |

## Minimum later write

One authorized fixture write can add the missing BlessBoard page section. It must use `buildBlessBoardWebsiteSectionFixture` with church A’s id, then the supported add-section call, then `provisionEmptyPublicPages`. A call without `churchId` will be rejected by the fixture and would be rejected again by the table.

No other repair is required before D26 HTTP. Do not drop `v13-d25-reuse-clinic`. Do not change `accepts_scheduled`. Do not rerun Foundation bootstrap.

Database-free contract and unit tests: 441 passed, 0 failed. The previous baseline was 437. The four new assertions cover the church id, cross-church rejection, credential-reuse classification, and the booking flag. Changed JavaScript parsed cleanly.

```
FINAL=V2131_D25A_FIXTURE_REMEDIATION
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
BB_DRAFT_ROOT_CAUSE=ADD_SECTION_OMITTED_CHURCH_ID
BB_FIXTURE_SOURCE_CORRECTED=YES
AC_EXTRA_CLINIC_CLASSIFICATION=EXPECTED_MULTI_CLINIC_REUSE
AC_PUBLIC_BOOKING_DISABLED=YES
SERVICE_POINT_POLICY=ACCEPTS_SCHEDULED_DOES_NOT_ENABLE_PUBLIC_BOOKING
SCENARIOS_READY=AC-REG-01,BB-REG-07,AC-AUTH-04,BB-AUTH-04,BB-MEM-01,BB-MEM-02,AC-WEB-08,AC-WEB-09,BB-WEB-09,BB-WEB-10,BB-ANN-01,BB-ANN-02,AC-REC-02,AC-REC-03,AC-PUB-01
SCENARIOS_PARTIAL=BB-WEB-08
SCENARIOS_BLOCKED=
SAFE_TESTS_PASSED=441
SAFE_TESTS_FAILED=0
DATABASE_MUTATION=NO
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
SHARED_POSTGRES_TOUCHED=NO
FILES_CHANGED=3
UNEXPECTED_FILES=
REPORT_PATH=docs/qa/V2131_D25A_FIXTURE_REMEDIATION.md
NEXT_FIXTURE_WRITE_AUTHORIZATION_REQUIRED=YES
D26_HTTP_READY=YES
BLOCKERS=BlessBoard public page and structured draft rows are still absent until an authorized write supplies church A id
```
