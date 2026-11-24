# V13 G119 acceptance matrix

| ID | SOURCE_FIX | HTTP | PLAYWRIGHT | DATABASE | SECURITY | BLOCKER | STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-REG-01 | Earlier denial | Pass | Pass | Pass | Duplicate phone denied | None | VERIFIED_E2E |
| AC-AUTH-04 | Reset replay | Pass | Pass | Pass | Used link denied | None | VERIFIED_E2E |
| AC-REC-02 | Walk-in | Pass | Pass | Pass | Clinic scope | None | VERIFIED_E2E |
| AC-REC-03 | Vitals | Pass | Pass | Pass | Other clinic denied | None | VERIFIED_E2E |
| AC-PUB-01 | Booking off | Pass | Pass | Pass | Booking stays off | None | VERIFIED_E2E |
| AC-WEB-08 | Section publish | Pass | Pass | Public heading | Other clinic excluded | None | VERIFIED_E2E |
| AC-WEB-09 | Mint theme | Pass | Pass | Public class | Invalid theme denied | None | VERIFIED_E2E |
| BB-REG-07 | Consent and unique name | Pass | Pass | Second church not created | Duplicate phone denied | None | VERIFIED_E2E |
| BB-AUTH-04 | Testing delivery read | Pass | Pass | Phone verification row | Code hidden; wrong code denied | None for this journey | VERIFIED_E2E |
| BB-MEM-01 | Required fields | Pass | Pass | Directory read-back | CSRF present | None | VERIFIED_E2E |
| BB-MEM-02 | Shell token | Pass | Pass | Member saved | Missing CSRF 403 | None | VERIFIED_E2E |
| BB-WEB-08 | Theme publish | Pass | Pass | Live class | Clinic theme rejected | None | VERIFIED_E2E |
| BB-WEB-09 | Path sermon | Pass | Pass | Public sermon | Other church excluded | None | VERIFIED_E2E |
| BB-WEB-10 | Path event | Pass | Pass | Public event | Other church excluded | None | VERIFIED_E2E |
| BB-ANN-01 | Path announcement | Pass | Pass | Public text | Other church excluded | None | VERIFIED_E2E |
| BB-ANN-02 | Uploads off | Pass | Pass | Text saved | Upload refused | Uploads stay disabled | VERIFIED_E2E |
| BB-06 login | Church path portal | Related HTTP activation passes | Pass | Member row and session | Wrong password, unknown org, other church denied | None | VERIFIED_E2E |
| INV-01 | Website editor invite | Existing invite service | Accept and login pass | Invitation accepted once | 403 on member creation; replay denied | None | VERIFIED_E2E |
| D14C | None applied | Fail | Not this journey | Table absent | Fail closed | Migration not authorized | BLOCKED |
| D16 platform OTP | None applied | Fail | Not this journey | Table absent | Fail closed | Migration not authorized | BLOCKED |
| D25 slot | None applied | Fail | Not this journey | No slot lock | Approval gate remains | Capacity not approved | BLOCKED |
| D25 overlap | None applied | Fail | Not this journey | SELECT outside the transaction | No new lock | Overlap policy not approved | BLOCKED |

Original 16: 16 `VERIFIED_E2E`, 0 `VERIFIED_HTTP`, 0 partial, 0 blocked, 0 deferred.

`BROWSER_9_VERIFIED=9`.

QA_GO is NO-GO because D14C, D16, and both D25 tests still fail.
