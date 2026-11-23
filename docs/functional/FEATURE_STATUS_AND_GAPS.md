# Feature status and gaps

G65–G76 keep the G35 counts. A saved prescription now says when it is not on the pharmacy queue. The laboratory reference-rule page previews a rule and does not store it. Stored clinical thresholds, media enablement, and production OTP delivery remain unactivated.

G82 ran the safe suite, the HTTP suite, and Playwright only against the disposable database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. Migrations 043 and 044 are applied on that disposable database only. Hosted QA, production, port 5432, and `getpro_v13_e2e_regression213101` were not migrated.

G83–G89 repaired verified failures without a new feature cycle. The G88 HTTP run is 34 executed, 20 passed, 14 failed, 0 skipped. The G88 Playwright run is 43 executed, 19 passed, 24 failed, 0 skipped. AC-REG-01, AC-AUTH-04, and AC-REC-03 now have both HTTP and browser passes. AC-REC-02 and AC-WEB-09 remain HTTP-only. Implementation counts stay 16 / 7 / 6 / 1 for ActiveClinic and 13 / 3 / 1 for BlessBoard. The release is not ready.

G90 continued on the same disposable database. Two complete HTTP runs after the fixture and recovery repairs each executed 34 tests, passed 30, failed 4, and skipped 0. The four failures are the absent OTP challenge table and the unimplemented appointment slot lock and staff overlap. Safe tests are 526 passed, 0 failed, and 2 skipped. The latest Playwright run is 43 executed, 20 passed, 23 failed, and 0 skipped. AC-REC-02 and AC-PUB-01 pass in both HTTP and the browser. The release is not ready. QA is NO-GO until the browser failures and the four blocked HTTP gates are resolved without enabling booking, media uploads, or platform.otp_challenges.

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

The D28 browser matrix records `TOTAL_BROWSER_ISSUES=9` and lists the later observations: AC-WEB-09, AC-REC-02, AC-REC-03, AC-AUTH-04, AC-PUB-01, BB-MEM-01, BB-MEM-02, BB-ANN-01, BB-ANN-02, BB-WEB-09, BB-WEB-10, and BB-WEB-08. That document’s own total is 9. This file does not renumber it. G88 browser result on those observations: AC-PUB-01, AC-AUTH-04, and AC-REC-03 passed. AC-WEB-09, AC-REC-02, BB-MEM-01, BB-MEM-02, BB-ANN-01, BB-ANN-02, BB-WEB-09, BB-WEB-10, and BB-WEB-08 failed.

G82 verification of the original 16 regression ids:

| ID | G82 class | What passed | What remains |
| --- | --- | --- | --- |
| AC-REG-01 | VERIFIED_E2E | HTTP duplicate-phone denial and the browser registration denial | None in the G88 run |
| AC-AUTH-04 | VERIFIED_E2E | HTTP reset path. Browser opens the used link and shows it is no longer valid | The earlier browser POST client hung. The GET replay is the passing assertion |
| AC-REC-03 | VERIFIED_E2E | HTTP and browser save 72 bpm. An anonymous request is redirected to login. The other clinic receives 403 | None in the G88 run |
| BB-REG-07 | VERIFIED_HTTP | HTTP duplicate church phone | Browser URL assertion failed |
| BB-AUTH-04 | VERIFIED_HTTP | Two complete HTTP runs sign in after a wrong code, an expired challenge, and a valid code | Browser requires `E2E_BB_MEMBER_OTP` |
| BB-MEM-01 | VERIFIED_HTTP | HTTP member form | Browser registration did not finish |
| BB-MEM-02 | VERIFIED_HTTP | HTTP missing CSRF returns 403 | Browser status assertion failed |
| AC-WEB-08 | VERIFIED_HTTP | HTTP drafts, previews, publishes, and isolates a section | The browser public page does not show the new heading |
| AC-WEB-09 | VERIFIED_HTTP | HTTP clinic theme | Draft preview renders `ac.default`, not the mint theme |
| BB-WEB-09 | VERIFIED_HTTP | HTTP public sermon marker after the test church website is published | Browser marker still missing |
| BB-WEB-10 | VERIFIED_HTTP | HTTP public event marker after the test church website is published | Browser marker still missing |
| BB-ANN-01 | VERIFIED_HTTP | HTTP public announcement marker after the test church website is published | Browser marker still missing |
| AC-REC-02 | VERIFIED_E2E | HTTP creates the patient and the browser check-in reaches the queue | None in the G90 run |
| AC-PUB-01 | VERIFIED_E2E | Browser and HTTP: booking stays disabled and no coupon | None in the G90 run |
| BB-WEB-08 | VERIFIED_HTTP | HTTP applies the church theme, publishes a church that has contact details and public pages, and the live page shows the theme | Browser theme journey still fails |
| BB-ANN-02 | VERIFIED_HTTP | HTTP returned 403 `media_uploads_disabled` and the test now requires that refusal while the flag is unset | Browser upload journey still fails. Uploads stay disabled |
