# G167 complete bug matrix

36 named items. 32 have a passing regression in this cycle's browser or HTTP runs. 4 stay blocked and are not passes: AC-FU-PORTAL-04, D14C, D16, and D25 slot capacity.

Execution evidence for the passing browser rows is both Playwright cycles in this cycle: ActiveClinic 29 and BlessBoard 23. HTTP rows that have an HTTP test passed in both HTTP runs except the three named failures. A test file on disk is not the evidence. The runs are.

| BUG_ID | STATUS | TEST_SOURCE | EXECUTION_EVIDENCE | BLOCKER |
| --- | --- | --- | --- | --- |
| AC-REG-01 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| BB-REG-07 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| AC-AUTH-04 | VERIFIED_LOCAL_E2E | browser and HTTP testing outbox | both cycles | production OTP off |
| BB-AUTH-04 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | testing delivery only |
| BB-MEM-01 | VERIFIED_LOCAL_E2E | browser search, reload, logout | both cycles | page 1 is not the proof |
| BB-MEM-02 | VERIFIED_LOCAL_E2E | browser and HTTP CSRF | both cycles | none |
| AC-WEB-08 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | binary upload off |
| AC-WEB-09 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| BB-WEB-08 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| BB-WEB-09 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| BB-WEB-10 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| BB-ANN-01 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| BB-ANN-02 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | upload disabled |
| AC-REC-02 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | none |
| AC-REC-03 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | original row kept |
| AC-PUB-01 | VERIFIED_LOCAL_E2E | browser and HTTP | both cycles | booking stays off |
| AC-FU-PORTAL-01 | VERIFIED_LOCAL_E2E | browser SQL count | both cycles | none |
| AC-FU-PORTAL-02 | VERIFIED_LOCAL_E2E | negative inside PORTAL-01 | both cycles | policy does not create a patient |
| AC-FU-PORTAL-03 | VERIFIED_LOCAL_E2E | AC-PUB-01 | both cycles | booking off |
| AC-FU-PORTAL-04 | BLOCKED_BY_MIGRATION | D14C and D16 | both HTTP runs failed | `platform.otp_challenges` absent |
| AC-FU-WEB-01 | VERIFIED_LOCAL_E2E | AC-WEB-08 | both cycles | none |
| AC-FU-WEB-02 | VERIFIED_LOCAL_E2E | browser publish | both cycles | HTTPS reference, not a file upload |
| AC-FU-WEB-03 | VERIFIED_LOCAL_E2E | AC-WEB-09 | both cycles | none |
| AC-FU-REC-01 | VERIFIED_LOCAL_E2E | create inside PORTAL-01 | both cycles | none |
| AC-FU-REC-02 | VERIFIED_LOCAL_E2E | walk-in | both cycles | none |
| AC-FU-REC-03 | VERIFIED_LOCAL_E2E | new queue row | both cycles | none |
| AC-FU-REC-04 | VERIFIED_LOCAL_E2E | existing number, one chart | both cycles | none |
| AC-FU-REC-05 | VERIFIED_LOCAL_E2E | clinician worklist | both cycles | none |
| AC-FU-CLIN-01 | VERIFIED_LOCAL_E2E | start encounter | both cycles | none |
| AC-FU-CLIN-02 | VERIFIED_LOCAL_E2E | AC-REC-03 stores 72 bpm | both cycles | none |
| AC-FU-CLIN-03 | VERIFIED_LOCAL_E2E | 72 kept, 80 appended | both cycles | none |
| AC-05 | VERIFIED_LOCAL_E2E | lower-privilege GET denial | both cycles | routes are GET |
| D25 overlap | VERIFIED_HTTP | two PostgreSQL clients | both HTTP runs | none |
| D25 slot | FAILED | slot test still throws | both HTTP runs | approval required |
| D14C | FAILED | OTP integration | both HTTP runs | table absent |
| D16 | FAILED | platform OTP | both HTTP runs | table absent |

D28 observations are the same browser file and were re-executed. Resend mock tests passed inside the safe suite. No live email was sent. G133–G149 defects that were fixed stay covered by the rows above. No new product defect was found in this cycle.

Root causes and fix commits for the original 16 remain the ones recorded in `docs/qa/V2132_G152_ALL_QA_BUG_COVERAGE.md`. This cycle did not reopen them.
