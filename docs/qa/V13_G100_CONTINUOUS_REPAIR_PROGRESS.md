# V13 G90 continuous repair progress

Latest complete run only. Earlier G88 counts stay in the G88 reports.

CYCLE_NUMBER=2
SAFE_EXECUTED=528
SAFE_PASSED=526
SAFE_FAILED=0
SAFE_SKIPPED=2
HTTP_EXECUTED=34
HTTP_PASSED=28
HTTP_FAILED=6
HTTP_SKIPPED=0
PLAYWRIGHT_EXECUTED=43
PLAYWRIGHT_PASSED=20
PLAYWRIGHT_FAILED=23
PLAYWRIGHT_SKIPPED=0
BUGS_REPAIRED_THIS_CYCLE=none new in cycle 2
REGRESSIONS_INTRODUCED=BB-AUTH-04 failed again because the second recovery returned 429 and no expired code was captured
REMAINING_FAILURE_IDS=BB-WEB-08, BB-AUTH-04, D14C OTP, D16 platform OTP, D25 slot, D25 overlap, AC-WEB-08 browser, AC-WEB-09 browser, BlessBoard browser journeys
BLOCKERS=Publish redirects to /hq/website/publish/error?codes=contact,incomplete,not_ready so the draft theme never becomes the live theme. platform.otp_challenges is not authorized. The slot lock and staff overlap are not authorized.
NEXT_ACTION=Give the synthetic church the contact and page data the existing publish check already requires, then rerun BB-WEB-08. Do not add platform.otp_challenges or the slot lock.

Cycle 1 HTTP was 29 passed and 5 failed. Cycle 2 is the later run and replaces it. Playwright was not rerun after cycle 2.
BUGS_REPAIRED_THIS_CYCLE=AC-REC-02 queue number collision, AC-WEB-08 foreign denial, AC-PUB-01 unpublished booking copy, BB public pages for a published test church, BB-AUTH-04 expired challenge, BB-06 member collision, INV-01 invitation collision, D16 clinic key collision
REGRESSIONS_INTRODUCED=0
REMAINING_FAILURE_IDS=BB-WEB-08, D14C OTP, D16 platform OTP, D25 slot, D25 overlap, AC-WEB-08 browser, AC-WEB-09 browser, BlessBoard browser public and invitation journeys
BLOCKERS=platform.otp_challenges is not authorized, appointment slot lock and staff overlap are not authorized, live BlessBoard theme class is still absent after publish, existing-church browser fixtures stay unpublished and invite or OTP secrets are not retained
NEXT_ACTION=Publish the draft theme onto the anonymous public page, then rerun BB-WEB-08. Do not add platform.otp_challenges or the slot lock.

The HTTP log for this cycle is `.v13-isolated-pg/g90-http5.log`. ActiveClinic Playwright is `.v13-isolated-pg/g90-ac.log` (18 passed, 2 failed). BlessBoard Playwright is `.v13-isolated-pg/g90-bb.log` (2 passed, 21 failed). The safe log is `.v13-isolated-pg/g90-safe.log`.
