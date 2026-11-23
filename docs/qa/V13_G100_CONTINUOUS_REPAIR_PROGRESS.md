# V13 G90 continuous repair progress

Latest complete run only. Earlier cycles are superseded by these totals.

CYCLE_NUMBER=3
SAFE_EXECUTED=528
SAFE_PASSED=526
SAFE_FAILED=0
SAFE_SKIPPED=2
HTTP_EXECUTED=34
HTTP_PASSED=30
HTTP_FAILED=4
HTTP_SKIPPED=0
PLAYWRIGHT_EXECUTED=43
PLAYWRIGHT_PASSED=20
PLAYWRIGHT_FAILED=23
PLAYWRIGHT_SKIPPED=0
BUGS_REPAIRED_THIS_CYCLE=BB-WEB-08 publish fixture, BB-AUTH-04 test IP cap
REGRESSIONS_INTRODUCED=0
REMAINING_FAILURE_IDS=D14C OTP, D16 platform OTP, D25 slot, D25 overlap, AC-WEB-08 browser, AC-WEB-09 browser, 21 BlessBoard browser scenarios
BLOCKERS=platform.otp_challenges is not authorized. Appointment slot lock and staff overlap are not authorized. Browser public rendering is still wrong.
NEXT_ACTION=Fix the public section heading and the existing-clinic theme preview. Do not add the OTP table or the appointment locks.

The repeat HTTP run matched 30 passed and 4 failed. Logs: `.v13-isolated-pg/g91-http3.log`, `.v13-isolated-pg/g91-ac.log`, `.v13-isolated-pg/g91-bb.log`, `.v13-isolated-pg/g91-safe.log`.
