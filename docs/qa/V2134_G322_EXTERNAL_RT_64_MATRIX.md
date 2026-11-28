# V2134 G322 external RT matrix

Report: ACTIVECLINIC REGRESSION TEST REPORT, Christine Manjombi.  
Reported date kept as written: **28/11/2025**. This review does not change that date or the historical 48 PASS / 16 FAIL totals.  
Aggregate: 64 scenarios, 48 historical PASS, 16 historical FAIL, 15 consolidated bug IDs claimed by the report.

ORIGINAL_DOCUMENT=NOT_ACCESSIBLE. Searches of the V13 worktree, Documents, and Downloads did not find the DOCX. The 16 rows below are the scenarios transcribed in the G322 request. Their individual bug IDs were not transcribed. The other 48 IDs are listed so the matrix has 64 rows, and they stay `NOT_TESTED` because their titles and historical row results were not available.

Local evidence is the G322 disposable run on `getpro_v13_e2e_g78d2301`. It is not a hosted tester pass. `PASS_HOSTED` is not used.

## Transcribed historical failures

| RT | Historical | Bug ID | Approved expectation | Local evidence | Classification | Hosted retest |
| --- | --- | --- | --- | --- | --- | --- |
| RT-03 | FAIL | not transcribed | Public booking stays disabled | AC-PUB-01 browser twice; HTTP booking 403 twice | DISABLED_BY_APPROVED_POLICY | YES |
| RT-07 | FAIL | not transcribed | Real email OTP only after a received message completes the action | No message received. Fixture OTP is not this row | BLOCKED_BY_PROVIDER | YES |
| RT-08 | FAIL | not transcribed | SMS is not an approved recovery channel | Approval register forbids SMS. Copy does not claim SMS delivery | DISABLED_BY_APPROVED_POLICY | YES |
| RT-28 | FAIL | not transcribed | New text section: create, edit, save, reload, preview, publish, public read-back | AC-FU-WEB-02 creates a new text section. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-29 | FAIL | not transcribed | New image section using an authorized reference, then the same publish path. Binary upload stays disabled | AC-FU-WEB-02 creates a new image section with `https://example.invalid/v13-synthetic-section.png`. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-30 | FAIL | not transcribed | Staff-created patient activates one portal account and signs in | AC-FU-PORTAL-01 browser and PostgreSQL count. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-31 | FAIL | not transcribed | Duplicate or unknown public registration does not create a second chart | Same journey: unknown phone is refused; patient count stays 1 | FIXED_VERIFIED_LOCALLY | YES |
| RT-32 | FAIL | not transcribed | Another clinic cannot claim the same patient | Wrong-clinic registration is refused in AC-FU-PORTAL-01 | FIXED_VERIFIED_LOCALLY | YES |
| RT-33 | FAIL | not transcribed | Testing password recovery completes without claiming email or SMS delivery | New AC-FU-PORTAL-05. Old password fails, replacement signs in, one consumed token, one patient. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-44 | FAIL | not transcribed | Vitals correction keeps the original and records the reason | AC-REC-03 browser twice. HTTP reads two `vital_sign_observations` rows: 72 preserved, 80 correcting it, reason retained. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-56 | FAIL | not transcribed | Received FBC proceeds to result entry, verification, and clinician read-back | G224 uses CBC with hemoglobin and WBC, a second verifier, and encounter read-back. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-57 | FAIL | not transcribed | Queue filters follow stored statuses. There is no `analysis` status. Received stays out of processing | G224: received filter shows the request; processing filter does not. Hub label "Lab in analysis" counts `processing` | FIXED_VERIFIED_LOCALLY | YES |
| RT-58 | FAIL | not transcribed | Laboratory counters come from persisted requests | Browser received counter is not zero. HTTP asserts `data-ac-lab-count="received">1`. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-59 | FAIL | not transcribed | Diagnostics counters come from persisted laboratory and radiology requests | Laboratory and radiology dashboards assert persisted counts. The hub reads those same aggregates | FIXED_VERIFIED_LOCALLY | YES |
| RT-60 | FAIL | not transcribed | Radiology filters and the full report lifecycle | G229: pending, reported, verification, clinician read-back. Twice | FIXED_VERIFIED_LOCALLY | YES |
| RT-64 | FAIL | not transcribed | Supported print views keep the clinical identity and reject the wrong clinic | SOAP and referral in G168, prescription in G177, laboratory in G224, radiology in G229, vitals log print in AC-REC-03. Twice | FIXED_VERIFIED_LOCALLY | YES |

RT-30 through RT-33 share one historical group in the request: existing patient login and portal activation. The four checks above are the checks the request named. They are not four separately titled rows from the missing DOCX.

## Rows without an individual transcription

Historical result for each ID: not available at row level. Current execution: `NOT_TESTED`. Bug ID: not transcribed. Hosted retest: not assigned until the original row is recovered.

RT-01, RT-02, RT-04, RT-05, RT-06, RT-09, RT-10, RT-11, RT-12, RT-13, RT-14, RT-15, RT-16, RT-17, RT-18, RT-19, RT-20, RT-21, RT-22, RT-23, RT-24, RT-25, RT-26, RT-27, RT-34, RT-35, RT-36, RT-37, RT-38, RT-39, RT-40, RT-41, RT-42, RT-43, RT-45, RT-46, RT-47, RT-48, RT-49, RT-50, RT-51, RT-52, RT-53, RT-54, RT-55, RT-61, RT-62, RT-63.

That is 48 rows. None of them is reclassified as a current PASS.
