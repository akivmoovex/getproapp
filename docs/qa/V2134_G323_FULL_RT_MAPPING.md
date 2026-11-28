# V2134 G323 full RT mapping

Report title: ACTIVECLINIC REGRESSION TEST REPORT.  
Prepared by: Christine Manjombi.  
Date as written on the report: **28/11/2025**.

That date is earlier than this review (28 November 2026). It is kept exactly as written and needs owner confirmation. It was not corrected.

ORIGINAL_DOCX_READ=NO.  
SOURCE_REPORT_UNAVAILABLE.

Searches of the V13 worktree, Downloads, and Desktop did not find a DOCX containing the author name, `RT-01`, or `64 scenarios`. The conversation attachment was not available on this Mac mini. The original document was not modified because it was not present.

Historical totals, taken from the G322 request and left unchanged: 64 scenarios, 48 PASS, 16 FAIL. Fifteen consolidated bug IDs were claimed by the report and were not transcribed. No scenario title, expected result, or observed result was invented for a row that was not transcribed.

The 16 rows below are the only scenarios with a transcribed expectation. They are the historical failures. Local execution on the disposable database does not convert a historical FAIL into a historical PASS.

## Transcribed historical failures

| RT | Historical | Bug ID | Transcribed expectation | Local evidence on this candidate | Classification |
| --- | --- | --- | --- | --- | --- |
| RT-03 | FAIL | not transcribed | Public booking stays disabled. Test the restriction. | AC-PUB-01 browser, 33/33 twice. HTTP booking denial in the 41/41 pair. | BLOCKED_BY_POLICY |
| RT-07 | FAIL | not transcribed | Real email OTP only after a received message completes the action. | No mailbox delivery. Playwright and testing reset tokens are not this row. | BLOCKED_BY_PROVIDER |
| RT-08 | FAIL | not transcribed | SMS recovery stays unavailable unless a later approval allows it. | Approval register still forbids SMS. No SMS send. | BLOCKED_BY_POLICY |
| RT-28 | FAIL | not transcribed | New text section: create, edit, save, reload, preview, publish, public read-back. | AC-FU-WEB-02. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-29 | FAIL | not transcribed | New image section with an authorized reference, then the same publish path. | AC-FU-WEB-02 uses `https://example.invalid/v13-synthetic-section.png`. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-30 | FAIL | not transcribed | Staff-created patient activates one portal account and signs in. | AC-FU-PORTAL-01. PostgreSQL patient count stays 1. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-31 | FAIL | not transcribed | Duplicate or unknown registration does not create a second chart. | Same journey: unknown phone refused; count stays 1. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-32 | FAIL | not transcribed | Another clinic cannot claim the same patient. | Wrong-clinic registration refused in AC-FU-PORTAL-01. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-33 | FAIL | not transcribed | Testing password recovery completes without claiming email or SMS delivery. | AC-FU-PORTAL-05. Old password fails, replacement signs in, one consumed token. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-44 | FAIL | not transcribed | Vitals correction keeps the original and records the reason. | AC-REC-03. HTTP reads two `vital_sign_observations` rows: 72 kept, 80 correcting it. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-56 | FAIL | not transcribed | Received FBC proceeds through result, verification, and clinician read-back. | G224 CBC with hemoglobin and WBC, second verifier, encounter read-back. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-57 | FAIL | not transcribed | Queue filters follow stored statuses. Received stays out of processing. | G224 received filter shows the request; processing filter does not. No stored `analysis` status. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-58 | FAIL | not transcribed | Laboratory counters come from persisted requests. | HTTP `data-ac-lab-count="received"` matches the inserted request. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-59 | FAIL | not transcribed | Diagnostics counters come from persisted laboratory and radiology requests. | HTTP hub cards `lab-pending`, `lab-processing`, `rad-pending`, and `rad-progress` equal the SQL counts for those statuses. A received laboratory request is not counted as processing. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-60 | FAIL | not transcribed | Radiology filters and the full report lifecycle. | G229 pending, reported, verification, clinician read-back. | PASS, then HOSTED_RETEST_REQUIRED |
| RT-64 | FAIL | not transcribed | Supported print views keep clinical identity and reject the wrong clinic. | SOAP and referral in G168, prescription in G177, laboratory in G224, radiology in G229, vitals log in AC-REC-03. | PASS, then HOSTED_RETEST_REQUIRED |

RT-30 through RT-33 were one historical group in the request: existing patient login and portal activation. The four rows are the four checks the request named. They are not four separately titled rows from the missing DOCX.

AC-AUTH-04 remains the staff testing reset. It is not RT-07 and it is not live email. On the first G323 browser pair the second run returned 404 from the testing delivery lookup because the shared disposable admin had used the five-request identifier window. The journey now clears that disposable identifier budget before the request. The following pair passed 33/33 twice. The product rate limit itself was not raised.

## Rows without a transcription

Historical result at row level: not available. Current execution: NOT_RUN. These 48 IDs are not reconciled and are not a current PASS.

RT-01, RT-02, RT-04, RT-05, RT-06, RT-09, RT-10, RT-11, RT-12, RT-13, RT-14, RT-15, RT-16, RT-17, RT-18, RT-19, RT-20, RT-21, RT-22, RT-23, RT-24, RT-25, RT-26, RT-27, RT-34, RT-35, RT-36, RT-37, RT-38, RT-39, RT-40, RT-41, RT-42, RT-43, RT-45, RT-46, RT-47, RT-48, RT-49, RT-50, RT-51, RT-52, RT-53, RT-54, RT-55, RT-61, RT-62, RT-63.

RT_DESCRIPTIONS_MAPPED=16.  
HISTORICAL_PASS=48.  
HISTORICAL_FAIL=16.
