# V13 G90 failure baseline

Starting point for this session was `1542b407e0035ae30f711b5b951e083f3f5db40a` on branch V13. G82 remains the historical baseline: safe 526/0/2, HTTP 16/18, Playwright 17/26. G88 improved HTTP to 20/14 and Playwright to 19/24. G90 then reached HTTP 28/6 before the repairs in this session.

The latest complete runs, which replace those intermediate counts, are:

- Safe: 528 executed, 526 passed, 0 failed, 2 skipped.
- HTTP: 34 executed, 30 passed, 4 failed, 0 skipped. The same totals repeated on the next full run.
- Playwright: 43 executed, 20 passed, 23 failed, 0 skipped.

| TEST_ID | PRODUCT | CLASS | OBSERVED | REPAIR_STATUS |
| --- | --- | --- | --- | --- |
| BB-WEB-08 | BlessBoard | FIXTURE_DEFECT | Publish redirected to contact and incomplete | HTTP pass after the synthetic church received an email and public pages |
| BB-AUTH-04 | BlessBoard | ENVIRONMENT_DEFECT | First recovery returned 429 after 20 OTP rows from 127.0.0.1 in one hour | HTTP pass with the test-only IP cap |
| D14C OTP | Shared | EXTERNAL_BLOCKER | `platform.otp_challenges` is absent | Not authorized |
| D16 platform OTP | Shared | EXTERNAL_BLOCKER | Same absent table | Not authorized |
| D25 slot | ActiveClinic | EXTERNAL_BLOCKER | `APT-01-03_NOT_IMPLEMENTED` | Not authorized |
| D25 overlap | ActiveClinic | EXTERNAL_BLOCKER | `BLOCKED_APPROVAL_REQUIRED` | Not authorized |
| AC-WEB-08 browser | ActiveClinic | APPLICATION_DEFECT | Public page does not show the new heading | HTTP pass, browser still fails |
| AC-WEB-09 browser | ActiveClinic | APPLICATION_DEFECT | Existing-clinic draft preview stays `ac.default` | HTTP pass, browser still fails |
| BlessBoard browser | BlessBoard | TEST_DEFECT and FIXTURE_DEFECT | Homepage editor link was absent on `/hq/website`. Public pages stay on the unpublished setup page. Invite and OTP secrets are not retained | 21 browser failures remain |
