# V13 G109 acceptance matrix

| ID | Source fix | HTTP | Browser | Persistence | Security | Status | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-REG-01 | Earlier registration denial | Pass | Pass | Pass | Duplicate phone denied | VERIFIED_E2E | None |
| AC-AUTH-04 | Reset replay | Pass | Pass | Pass | Used link denied | VERIFIED_E2E | None |
| AC-REC-02 | Walk-in check-in | Pass | Pass | Pass | Clinic scope | VERIFIED_E2E | None |
| AC-REC-03 | Vitals | Pass | Pass | Pass | Other clinic 403 | VERIFIED_E2E | None |
| AC-PUB-01 | Disabled booking | Pass | Pass | Pass | Booking stays off | VERIFIED_E2E | None |
| AC-WEB-08 | Publish response wait | Pass | Pass | Public heading | Other clinic excluded by the existing route | VERIFIED_E2E | None |
| AC-WEB-09 | Draft URL without preview override | Pass | Pass | Mint theme class | Invalid theme 400 | VERIFIED_E2E | None |
| BB-REG-07 | Consent and unique church name | Pass | Pass | Second church not created | Duplicate phone denied | VERIFIED_E2E | None |
| BB-AUTH-04 | Existing HTTP recovery | Pass | Fail | HTTP only | Code stays hidden | VERIFIED_HTTP | `E2E_BB_MEMBER_OTP` is unset |
| BB-MEM-01 | Required fields and review submit | Pass | Pass | Directory read-back | CSRF on the form | VERIFIED_E2E | None |
| BB-MEM-02 | Token matched by value | Pass | Pass | Member saved | Missing CSRF 403 | VERIFIED_E2E | None |
| BB-WEB-08 | Theme card and visible publish | Pass | Pass | Live theme class | Clinic theme rejected | VERIFIED_E2E | None |
| BB-WEB-09 | Publish service and path page | Pass | Pass | Public sermon | Other church excluded | VERIFIED_E2E | None |
| BB-WEB-10 | Publish service and path page | Pass | Pass | Public event | Other church excluded | VERIFIED_E2E | None |
| BB-ANN-01 | Path announcements | Pass | Pass | Public announcement | Other church excluded | VERIFIED_E2E | None |
| BB-ANN-02 | Disabled upload assertion | Pass | Pass | Text announcement | Upload 403 and turned-off UI | VERIFIED_E2E | Uploads remain disabled |

Original 16: 15 `VERIFIED_E2E`, 1 `VERIFIED_HTTP`, 0 partial, 0 blocked, 0 deferred.

D28 observations now passing in the browser: AC-WEB-09, AC-REC-02, AC-REC-03, AC-AUTH-04, AC-PUB-01, BB-MEM-01, BB-MEM-02, BB-ANN-01, BB-ANN-02, BB-WEB-09, BB-WEB-10, BB-WEB-08. `BROWSER_9_VERIFIED=9`.

Separate blocked gates, not part of the 16: D14C OTP, D16 platform OTP, D25 slot, D25 overlap.
