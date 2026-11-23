# V13 G100 QA handoff

FINAL=V13_G100_OVERNIGHT_QA_STABILIZATION

BRANCH=V13
REMOTE_SHA=SEE_PUSH_VERIFICATION
REMOTE_SHA_MATCH=SEE_PUSH_VERIFICATION

TEST_DATABASE=getpro_v13_e2e_g78d2301
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=55432

SAFE_TESTS_PASSED=526
SAFE_TESTS_FAILED=0
SAFE_TESTS_SKIPPED=2

HTTP_TESTS_EXECUTED=34
HTTP_TESTS_PASSED=30
HTTP_TESTS_FAILED=4
HTTP_TESTS_SKIPPED=0
HTTP_REPEAT_RUN_PASSED=30
HTTP_REPEAT_RUN_FAILED=4

PLAYWRIGHT_EXECUTED=43
PLAYWRIGHT_PASSED=20
PLAYWRIGHT_FAILED=23
PLAYWRIGHT_SKIPPED=0

The previous full browser run had the same 20 passed and 23 failed.

ORIGINAL_16_VERIFIED_E2E=5
ORIGINAL_16_VERIFIED_HTTP_ONLY=11
ORIGINAL_16_PARTIAL=0
ORIGINAL_16_BLOCKED=0
ORIGINAL_16_DEFERRED=0

MIGRATION_043=G78_DISPOSABLE_ONLY
MIGRATION_044=G78_DISPOSABLE_ONLY

PUBLIC_BOOKING=DISABLED
PRODUCTION_MEDIA_UPLOAD=DISABLED
PRODUCTION_OTP=DISABLED

SHARED_POSTGRES_TOUCHED=NO
EXISTING_QA_DB_TOUCHED=NO
PRODUCTION_TOUCHED=NO
DEPLOYMENT=NOT_PERFORMED

QA_GO_NO_GO=NO-GO
RELEASE_READY=NO

Tester sequence for tomorrow:

1. Use only `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.
2. Confirm booking, media uploads, and production OTP are off.
3. Exercise registration denial, password-reset replay, walk-in, and vitals. Those passed here.
4. Treat the four HTTP gates and the 23 browser failures as open. Do not expect the OTP challenge table or the appointment locks.

Functional specification: `docs/functional/FEATURE_STATUS_AND_GAPS.md`.

NEXT_RECOMMENDED_ACTION=Show the saved clinic section and the selected draft theme on the public preview, and publish the BlessBoard browser church through the existing publish flow. Do not add platform.otp_challenges or the appointment locks.
