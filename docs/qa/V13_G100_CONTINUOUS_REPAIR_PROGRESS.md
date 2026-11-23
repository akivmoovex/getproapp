# V13 G90 continuous repair progress

Latest complete run only. Earlier G88 counts stay in the G88 reports.

CYCLE_NUMBER=1
SAFE_EXECUTED=528
SAFE_PASSED=526
SAFE_FAILED=0
SAFE_SKIPPED=2
HTTP_EXECUTED=34
HTTP_PASSED=29
HTTP_FAILED=5
HTTP_SKIPPED=0
PLAYWRIGHT_EXECUTED=43
PLAYWRIGHT_PASSED=20
PLAYWRIGHT_FAILED=23
PLAYWRIGHT_SKIPPED=0
BUGS_REPAIRED_THIS_CYCLE=AC-REC-02 queue number collision, AC-WEB-08 foreign denial, AC-PUB-01 unpublished booking copy, BB public pages for a published test church, BB-AUTH-04 expired challenge, BB-06 member collision, INV-01 invitation collision, D16 clinic key collision
REGRESSIONS_INTRODUCED=0
REMAINING_FAILURE_IDS=BB-WEB-08, D14C OTP, D16 platform OTP, D25 slot, D25 overlap, AC-WEB-08 browser, AC-WEB-09 browser, BlessBoard browser public and invitation journeys
BLOCKERS=platform.otp_challenges is not authorized, appointment slot lock and staff overlap are not authorized, live BlessBoard theme class is still absent after publish, existing-church browser fixtures stay unpublished and invite or OTP secrets are not retained
NEXT_ACTION=Publish the draft theme onto the anonymous public page, then rerun BB-WEB-08. Do not add platform.otp_challenges or the slot lock.

The HTTP log for this cycle is `.v13-isolated-pg/g90-http5.log`. ActiveClinic Playwright is `.v13-isolated-pg/g90-ac.log` (18 passed, 2 failed). BlessBoard Playwright is `.v13-isolated-pg/g90-bb.log` (2 passed, 21 failed). The safe log is `.v13-isolated-pg/g90-safe.log`.
