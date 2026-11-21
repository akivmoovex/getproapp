# V2.13.1 overnight fix summary

Branch `V13`, HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. The worktree is dirty on purpose. D04–D18 changes are still present. Nothing was reset, committed, pushed, or deployed.

This pass re-read the D13–D18 reports, the D04 and D05 acceptance notes, and the current diff. It syntax-checked every changed JavaScript and CJS file. It ran the database-free contract and unit suite: 427 passed, 0 failed. It did not run the D04 or D05 HTTP suites, Playwright, bootstrap, or any PostgreSQL command. Write, browser, and database URL flags were unset. Workflow files, `package.json`, and SQL migrations are not in the diff. The V13 CI jobs remain `if: false`.

No bug is closed. Each source change below is `IMPLEMENTED_UNVERIFIED`. The matching HTTP and browser scenarios stay `NOT_RUN`.

## What changed

D13 edited registration and BlessBoard recovery. A second ActiveClinic clinic on the same phone is inserted only when the password matches the existing identity, or a non-rejected application hash when no identity exists yet. The check and insert share `pg_advisory_xact_lock`. A unique-index church-phone collision is returned as the duplicate-phone message. Recovery HTML no longer prints a test OTP. The submitted verification id must be the one stored on the draft, and the test provider stays off when the deployment is production.

AC-AUTH-04 was inspected and not edited. `activeClinicPasswordRecoveryService.js` already records a testing outbox, the check copy still contains “If an eligible ActiveClinic account exists”, and the staff shell marker `data-ac-shell="staff-app"` is still on `views/activeclinic/layouts/app-shell.ejs`. There is no new unit test for that flow. Its D04 runner was not executed.

D14 left address, marital status, and next of kin optional on the HQ member form when they are omitted, and still validates them when they are sent. The review and created pages show name, phone, email, and branch. CSRF is still one `_csrf` field, and a bad token is still 403.

D15 gives website sections a UUID from `newSectionId()`. CMS field names `bodytext`, `buttonlabel`, and `buttonurl` alias the canonical fields. Theme values unwrap `.v` and `.value`. Draft and published theme ids are selected by mode, and a theme from the other product returns `invalid_theme`.

D16 resets the structured-content add control so a new sermon or event is not the seeded row. Public sermons and events hide explicit drafts. Announcement status posted from the form normalizes so a publish click wins. The announcement file input posts to the existing upload route and the public pages print the filename and asset id.

D17 lets a queue manager add a service point for the signed-in facility only. Walk-in options stay on that facility. A stored heart rate of 72 displays as `72 bpm`. Observation types stay inside the existing SQL check. Pain score was not added. Public booking stays off unless `public_booking_enabled` is strictly true. Coupons and enabled booking were not added.

D18 added a preflight helper that refuses port `5432`, the shared Postgres.app data directory, trust authentication, and teardown of any other database. The bootstrap wrapper does not call that helper yet, so a URL on `127.0.0.1:5432` is still accepted by the older guard. No instance was created. `.v13-isolated-pg/` is gitignored.

## Contracts that stayed in place

`activeClinicAppointmentService.js` is not in the diff. Optimistic `version` checks are still there. The synthetic concurrency plan still records `capacity: null` and `missingProtection: "slot_capacity_lock"`. The disposable-name rule is still `getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}`. CSRF checks remain on member create, vitals save, walk-in, and service-point create. Clinic walk-in patient lookup is organization-scoped. Vitals reads filter organization and facility. Finder copies named `* 2.js` were not edited.

## What cannot be closed here

All 16 acceptance scenarios need an authorized HTTP run and a Playwright run against the isolated database from D18. Until then they stay `NOT_RUN`.

These execution gaps are not new schema:

- The wrapper can still be aimed at the shared port `5432` if the D18 preflight is skipped.
- `applyActiveClinicFixtures()` still calls `provisionHostedAuthQaClinic()`, which sets `public_booking_enabled = true`. The synthetic plan does not, and it is not what that function applies.
- The synthetic plan names the walk-in service point and the reception and clinical departments, but nothing in the apply path calls `insertServicePoint` or assigns those department roles. An authorized AC-REC-02 or AC-REC-03 run fails closed without them.
- Enabled booking and coupon confirmation remain deferred product scope. The disabled-state assertions must stay.

No overnight fix needs a migration.

## Evidence limits

Safe tests prove the database-free contracts and the source shapes they read. They do not prove a saved row, a queue redirect, a published page, or a browser login. `docs/qa/V2131_D13_AUTH_REG_FIXES.md` describes AC-AUTH-04 and BB-AUTH-04 but has no `FINAL=` trailer. The classification in this reconciliation is taken from the source and the later reports.

FINAL=V2131_OVERNIGHT_FINAL
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
TOTAL_BUGS=16
SOURCE_FIXES_IMPLEMENTED=16
PARTIAL_FIXES=0
BLOCKED_FIXES=0
BUG_IDS_IMPLEMENTED=AC-REG-01, BB-REG-07, AC-AUTH-04, BB-AUTH-04, BB-MEM-01, BB-MEM-02, AC-WEB-08, AC-WEB-09, BB-WEB-08, BB-WEB-09, BB-WEB-10, BB-ANN-01, BB-ANN-02, AC-REC-02, AC-REC-03, AC-PUB-01
BUG_IDS_REMAINING=
SAFE_TESTS_PASSED=427
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
SHARED_POSTGRES_UNCHANGED=YES
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
DEPLOYMENT=NOT_PERFORMED
RELEASE_READY=NO
FILES_CHANGED=89
UNEXPECTED_FILES=
REPORT_PATHS=docs/qa/V2131_OVERNIGHT_FIX_SUMMARY.md, docs/qa/V2131_REGRESSION_BUG_MATRIX.md, docs/qa/V2131_RELEASE_READINESS.md
BLOCKERS=All 16 acceptance scenarios stay NOT_RUN until authorized HTTP and browser execution on the isolated database. The bootstrap wrapper still accepts port 5432 because it does not call the D18 preflight. applyActiveClinicFixtures still enables public booking and does not insert the walk-in service point or department roles. Enabled booking and coupons remain deferred. No migration is required.
