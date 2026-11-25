# G152 historical QA bug coverage

36 named items are mapped. 32 have a passing regression in this cycle's browser or HTTP runs. 4 stay blocked and are not passes: AC-FU-PORTAL-04, D14C, D16, and D25 slot capacity.

## Original 16

Each of these passed in both Playwright cycles on the disposable database. HTTP counterparts passed in both HTTP runs where an HTTP test exists.

| ID | Failure that was fixed | Proof this cycle | Limit |
| --- | --- | --- | --- |
| AC-REG-01 | Duplicate clinic phone accepted a mismatched password | Browser and HTTP | Synthetic registration only |
| BB-REG-07 | Duplicate church phone created a second church | Browser and HTTP | Synthetic registration only |
| AC-AUTH-04 | Reset link visible or replayable | Browser and HTTP testing outbox | Production OTP stays off |
| BB-AUTH-04 | Recovery showed the code | Browser and HTTP | Testing delivery only |
| BB-MEM-01 | Member form skipped required fields or the directory could not find the member | Browser. Search, profile reload, and logout added | Directory page 1 is not the proof |
| BB-MEM-02 | CSRF missing token was accepted | Browser and HTTP | Shell token still required |
| AC-WEB-08 | Draft section was public | Browser and HTTP | Binary upload stays off |
| AC-WEB-09 | Church theme could be selected | Browser and HTTP | Cross-product theme rejected |
| BB-WEB-08 | Clinic theme could be selected | Browser and HTTP | Cross-product theme rejected |
| BB-WEB-09 | Draft sermon was public | Browser and HTTP | Other church does not see it |
| BB-WEB-10 | Draft event was public | Browser and HTTP | Other church does not see it |
| BB-ANN-01 | Announcement leaked across churches | Browser and HTTP | Public audience is explicit |
| BB-ANN-02 | Attachment published without a file gate | Browser and HTTP | Upload stays disabled; filename is absent publicly |
| AC-REC-02 | Walk-in left the clinic service point | Browser and HTTP | Public booking stays off |
| AC-REC-03 | Vitals overwrite or cross-session edit | Browser and HTTP. 72 bpm kept, 80 bpm appended, 140 bpm absent | Correction does not delete history |
| AC-PUB-01 | Public booking offered a coupon | Browser and HTTP | Booking stays disabled |

## Follow-up IDs

| ID | Result | Evidence |
| --- | --- | --- |
| AC-FU-PORTAL-01 | PASS | Staff-created patient, one row, portal login, profile shows the number |
| AC-FU-PORTAL-02 | PASS as a negative | Unknown registration shows no matching record and does not insert a patient |
| AC-FU-PORTAL-03 | PASS | Public booking stays disabled |
| AC-FU-PORTAL-04 | BLOCKED | Same absent OTP table as D14C and D16 |
| AC-FU-WEB-01 | PASS | `AC-WEB-08` |
| AC-FU-WEB-02 | PASS | Private until publish; HTTPS image reference renders |
| AC-FU-WEB-03 | PASS | `AC-WEB-09` |
| AC-FU-REC-01 | PASS | Create step inside `AC-FU-PORTAL-01` |
| AC-FU-REC-02 | PASS | Walk-in |
| AC-FU-REC-03 | PASS | New patient on the reception queue |
| AC-FU-REC-04 | PASS | Existing number does not create a second chart |
| AC-FU-REC-05 | PASS | Clinical staff open the worklist |
| AC-FU-CLIN-01 | PASS | Start encounter is offered |
| AC-FU-CLIN-02 | PASS | `AC-REC-03` stores 72 bpm |
| AC-FU-CLIN-03 | PASS | `AC-REC-03` keeps 72 bpm and shows 80 bpm |

## Later gates

| ID | Result | Evidence |
| --- | --- | --- |
| AC-05 | PASS | Lower-privilege session receives 403 or 404 on the test-database page and preview. Body does not contain the management title. The routes are GET. |
| D25 overlap | PASS | Both HTTP runs. One row wins, retry rejected, other staff and the next interval succeed. |
| D25 slot | FAIL | `APT-01-03_NOT_IMPLEMENTED`. Capacity stays null. |
| D14C | FAIL | Production activation stays blocked. Challenge table absent. |
| D16 platform OTP | FAIL | Second worker cannot verify. ActiveClinic auth in the same file passed. |
| Resend | MOCK PASS | Safe suite includes the adapter tests. No live send. |

D28 browser observations are the same browser file. Both full cycles passed, so those observations were re-executed rather than left as notes.
