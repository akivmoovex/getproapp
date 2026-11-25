# Feature status and gaps

G175 kept QA at NO-GO. Two safe runs each executed 572, passed 570, failed 0, and skipped 2. Two HTTP runs each executed 35, passed 32, and failed D14C, D16 platform OTP, and D25 slot capacity. Two Playwright cycles each passed ActiveClinic 29 and BlessBoard 23. A clinician consultation draft is now signed through the encounter complete action, and a prescription without a catalogue id stays off the pharmacy queue. No migration was applied. No email was sent.

G165 kept QA at NO-GO. Two safe runs each executed 572, passed 570, failed 0, and skipped 2. Two HTTP runs each executed 35, passed 32, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Two Playwright cycles each passed ActiveClinic 28 and BlessBoard 23. No migration was applied. No email was sent. Hosted QA was not deployed.

G146 kept QA at NO-GO. Two safe runs each executed 571, passed 569, failed 0, and skipped 2. Two HTTP runs after the fixture-phone repair each executed 35, passed 32, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Two Playwright cycles each passed ActiveClinic 26 and BlessBoard 23. Public `/healthz` on the pronline hosts showed `a8e6e688b084` during the read-only preflight. This cycle did not deploy. Resend domain verification was not observed.

G141 kept the disposable database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. Two safe runs each executed 569, passed 567, failed 0, and skipped 2. Two HTTP runs each executed 35, passed 32, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Two Playwright cycles each passed ActiveClinic 26 and BlessBoard 23. Resend email transport is implemented and was not connected. No email was sent. QA is NO-GO.

G138 used `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` only. Two HTTP runs each executed 35, passed 32, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Two Playwright cycles each passed ActiveClinic 22 and BlessBoard 23. Safe tests passed 559 of 561, with 2 skipped. QA is NO-GO. Hosted QA, binary media upload, public self-registration, and public booking are not claimed. D21-05 still has no capacity number.

G65–G76 keep the G35 counts. A saved prescription now says when it is not on the pharmacy queue. The laboratory reference-rule page previews a rule and does not store it. Stored clinical thresholds, media enablement, and production OTP delivery remain unactivated.

G82 ran the safe suite, the HTTP suite, and Playwright only against the disposable database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. Migrations 043 and 044 are applied on that disposable database only. Hosted QA, production, port 5432, and `getpro_v13_e2e_regression213101` were not migrated.

G83–G89 repaired verified failures without a new feature cycle. The G88 HTTP run is 34 executed, 20 passed, 14 failed, 0 skipped. The G88 Playwright run is 43 executed, 19 passed, 24 failed, 0 skipped. AC-REG-01, AC-AUTH-04, and AC-REC-03 now have both HTTP and browser passes. AC-REC-02 and AC-WEB-09 remain HTTP-only. Implementation counts stay 16 / 7 / 6 / 1 for ActiveClinic and 13 / 3 / 1 for BlessBoard. The release is not ready.

G90 continued on the same disposable database. Two complete HTTP runs after the fixture and recovery repairs each executed 34 tests, passed 30, failed 4, and skipped 0. The four failures are the absent OTP challenge table and the unimplemented appointment slot lock and staff overlap. Safe tests are 526 passed, 0 failed, and 2 skipped. The latest Playwright run is 43 executed, 20 passed, 23 failed, and 0 skipped. AC-REC-02 and AC-PUB-01 pass in both HTTP and the browser. The release is not ready. QA is NO-GO until the browser failures and the four blocked HTTP gates are resolved without enabling booking, media uploads, or platform.otp_challenges.

G120 kept the same disposable database and did not add a migration. Two HTTP runs each executed 34, passed 30, failed 4, and skipped 0. Two Playwright runs each executed 43, passed 43, and failed 0. Safe tests are 531 executed, 529 passed, 0 failed, and 2 skipped. Member login, staff invitation, and member recovery now pass in the browser. QA stays NO-GO because the OTP table and appointment locks still fail.

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
| BB-REG-07 | VERIFIED_E2E | HTTP duplicate church phone. Browser reaches the administrator step and shows the phone error | None in the G110 browser runs |
| BB-AUTH-04 | VERIFIED_E2E | HTTP recovery and the browser journey accept one code, reject a wrong code, and hide the code on the page | The testing read is refused outside the testing deployment |
| BB-MEM-01 | VERIFIED_E2E | HTTP member form. Browser review and directory read-back pass | None in the G110 browser runs |
| BB-MEM-02 | VERIFIED_E2E | HTTP missing CSRF returns 403. Browser rejects the missing token and accepts the shell token | None in the G110 browser runs |
| AC-WEB-08 | VERIFIED_E2E | HTTP and browser draft, publish, and public heading | None in the two ActiveClinic browser runs |
| AC-WEB-09 | VERIFIED_E2E | HTTP and browser mint theme draft, publish, and public theme class | None in the two ActiveClinic browser runs |
| BB-WEB-09 | VERIFIED_E2E | HTTP and browser public sermon after publish, isolated from the other church | None in the G110 browser runs |
| BB-WEB-10 | VERIFIED_E2E | HTTP and browser public event after publish, isolated from the other church | None in the G110 browser runs |
| BB-ANN-01 | VERIFIED_E2E | HTTP and browser public announcement on the path church page | None in the G110 browser runs |
| AC-REC-02 | VERIFIED_E2E | HTTP creates the patient and the browser check-in reaches the queue | None in the G90 run |
| AC-PUB-01 | VERIFIED_E2E | Browser and HTTP: booking stays disabled and no coupon | None in the G90 run |
| BB-WEB-08 | VERIFIED_E2E | HTTP and browser apply the church theme, publish, and show it on the live page. A clinic theme is rejected | None in the G110 browser runs |
| BB-ANN-02 | VERIFIED_E2E | HTTP returned 403 `media_uploads_disabled`. Browser shows uploads turned off, publishes the text, and isolates it | Uploads stay disabled |
