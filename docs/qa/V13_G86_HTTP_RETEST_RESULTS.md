# V13 G86 HTTP retest

G82 baseline, `.v13-isolated-pg/g82-http.log`: 34 executed, 16 passed, 18 failed, 0 skipped.

Latest full run, `.v13-isolated-pg/g88-http2.log`: 34 executed, 20 passed, 14 failed, 0 skipped. Preflight stayed on `getpro_v13_e2e_g78d2301` at port 55432 with booking disabled. This is the G88 HTTP count. The earlier `.v13-isolated-pg/g88-http.log` was 19 passed and 15 failed, before the other-clinic vitals assertion.

## Passed that were failing in G82

| Test | Repair |
| --- | --- |
| BB-24 | Unresolved church returns 404 before body validation |
| BB-ANN-02 | 403 `media_uploads_disabled` is the asserted disabled state |
| AC-REC-02 | `step=confirm` and a unique surname create the patient and the queue |
| AC-REC-03 | Heart rate is saved. Anonymous HTML is redirected to login. The other clinic receives 403 |

## Still failing, with evidence

| Test | Remaining cause |
| --- | --- |
| BB-06 | `authenticated_ownership_required` |
| BB-AUTH-04 | Expired testing OTP was not captured |
| BB-ANN-01 | Unpublished website setup page |
| AC-WEB-08 | Section settings 404 |
| AC-REC-03 | Other-clinic assertion was updated. The G88 count includes this test as passed |
| AC-PUB-01 | Unpublished clinic returns "Clinic unavailable", not the booking-disabled sentence |
| BB-WEB-08 | Canonical theme page has no extracted CSRF field |
| BB-WEB-09 | Unpublished website |
| BB-WEB-10 | Unpublished website |
| D14C | `platform.otp_challenges` absent by contract |
| D16 clinic registration | No facility and administrator returned |
| D16 platform OTP | Same absent challenge table |
| D25 slot | `APT-01-03_NOT_IMPLEMENTED` |
| D25 overlap | `BLOCKED_APPROVAL_REQUIRED` |
| INV-01 | `staff invite failed: conflict` |

No failing test was deleted. Skipped tests are not counted as passed. CSRF, the OTP table, the slot lock, and media enablement were not weakened.
