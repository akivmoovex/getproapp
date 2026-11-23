# Feature status and gaps

G65–G76 keep the G35 counts. A saved prescription now says when it is not on the pharmacy queue. The laboratory reference-rule page previews a rule and does not store it. Stored clinical thresholds, media enablement, and production OTP delivery remain unactivated.

G82 ran the safe suite, the HTTP suite, and Playwright only against the disposable database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. Migrations 043 and 044 are applied on that disposable database only. Hosted QA, production, port 5432, and `getpro_v13_e2e_regression213101` were not migrated. Implementation counts stay 16 / 7 / 6 / 1 for ActiveClinic and 13 / 3 / 1 for BlessBoard. No requirement moves to `VERIFIED_E2E` except AC-REG-01, whose HTTP and browser assertions both passed. The release is not ready.

| ID | Can continue without a new approval | Why it stays |
| --- | --- | --- |
| AC-06 | Yes, as the current encounter list | No broader continuity policy |
| AC-11 | No | Diagnosis codes would be invented |
| AC-12 | No | The form forbids a catalogue picker |
| AC-13 | No | Reference ranges are not approved. Migration 044 exists only on the G78 disposable database |
| AC-14 | Yes, through the existing dispense service | Queue handoff is AC-12 |
| AC-17 | No | Binary storage is deferred |
| AC-18 | No | Migration 043 exists only on the G78 disposable database and the service is unrouted |
| AC-19 | No | Paper destruction needs legal approval |
| AC-25 | No | Export was not executed |
| AC-26 | No | Offline is 503 and restore is absent |
| AC-27 | No | No accessibility audit |
| AC-28 | No | No monitoring contract |
| AC-29 | No | Deferred interoperability |
| AC-30 | No | No performance test |
| BB-06 | No | Public-page rows are absent |
| BB-11 | No | Uploads stay disabled |
| BB-13 | Yes, as a request category | A new prayer module is unapproved |
| BB-16 | No | Reports were not executed |

Original regression ids, all `IMPLEMENTED_UNVERIFIED` except where noted: AC-REG-01, BB-REG-07, AC-AUTH-04, BB-AUTH-04, BB-MEM-01, BB-MEM-02, AC-WEB-08, AC-WEB-09, BB-WEB-09, BB-WEB-10, BB-ANN-01, AC-REC-02, AC-REC-03, AC-PUB-01. BB-WEB-08 is `PARTIAL`. BB-ANN-02 is `PARTIAL`.

The D28 browser matrix records `TOTAL_BROWSER_ISSUES=9` and lists the later observations: AC-WEB-09, AC-REC-02, AC-REC-03, AC-AUTH-04, AC-PUB-01, BB-MEM-01, BB-MEM-02, BB-ANN-01, BB-ANN-02, BB-WEB-09, BB-WEB-10, and BB-WEB-08. That document’s own total is 9. This file does not renumber it. G82 executed those browser tests. AC-PUB-01’s disabled-booking browser assertion passed. The other listed observations failed or stayed partial. None of those rows is `VERIFIED_E2E`.

G82 verification of the original 16 regression ids:

| ID | G82 class | What passed | What remains |
| --- | --- | --- | --- |
| AC-REG-01 | VERIFIED_E2E | HTTP duplicate-phone denial and the browser registration denial | None in this run |
| BB-REG-07 | VERIFIED_HTTP | HTTP duplicate church phone | Browser URL assertion failed |
| AC-AUTH-04 | VERIFIED_HTTP | HTTP reset path | Browser replay POST exceeded 90s |
| BB-AUTH-04 | PARTIAL | — | Expired OTP was not captured. Browser requires `E2E_BB_MEMBER_OTP` |
| BB-MEM-01 | VERIFIED_HTTP | HTTP member form | Browser registration did not finish |
| BB-MEM-02 | VERIFIED_HTTP | HTTP missing CSRF returns 403 | Browser status assertion failed |
| AC-WEB-08 | PARTIAL | — | Draft section heading is absent on the public page |
| AC-WEB-09 | VERIFIED_HTTP | HTTP clinic theme | Draft preview renders `ac.default`, not the mint theme |
| BB-WEB-09 | PARTIAL | — | Public sermon marker missing. Browser failed |
| BB-WEB-10 | PARTIAL | — | Public event marker missing. Browser failed |
| BB-ANN-01 | PARTIAL | — | Public announcement marker missing. Browser failed |
| AC-REC-02 | PARTIAL | Browser created a uniquely named patient | Walk-in stayed on `/app/reception/walk-in` |
| AC-REC-03 | PARTIAL | Browser created a uniquely named patient | Vitals page did not show Heart rate |
| AC-PUB-01 | PARTIAL | Browser: booking stays disabled and no coupon | HTTP did not find the expected disabled-booking text |
| BB-WEB-08 | PARTIAL | — | HTTP returned 303. Browser theme assertion failed |
| BB-ANN-02 | PARTIAL | HTTP returned 403 `media_uploads_disabled` while the flag is unset | That refusal is the intended disabled state. The upload journey did not pass |
