# V2134 G334 fifteen-bug closure

HOSTED_STATUS for every row is the current testing SHA `9d87d73a7957`. None of these local results are hosted human acceptance. The original DOCX was not reopened in this session.

| BUG | RT | Original failure | Root cause | Status | Evidence | QA retest |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-01 | RT-07 | Email OTP was not received | Delivery stayed inactive, and the catalog sender never reached Resend | BLOCKED_PROVIDER | Mock provider 4/4. No mailbox | Yes, after owner approval. Do not use a testing code |
| BUG-02 | RT-08 | No SMS reset arrived | SMS is not an approved channel | DEFERRED_BY_POLICY | SMS dispatch fails closed. No success message was added | Confirm the product does not claim an SMS was sent |
| BUG-03 | RT-03 | Public booking was unavailable | Booking is disabled by policy. The old open route is denied | DEFERRED_BY_POLICY | AC-PUB-01 inside both ActiveClinic browser runs. HTTP preflight rejects an enabled booking flag | Confirm GET and POST stay denied |
| BUG-04 | RT-30 | Existing patient saw invalid credentials | Portal login follows activation | FIXED_LOCAL_TESTED | AC-FU-PORTAL-01 and patient OTP success, twice | Activate one hosted chart, then sign in |
| BUG-05 | RT-31 | Unmatched registration found no chart | Chart-first policy | PRODUCT_DECISION | Patient OTP unmatched case and AC-FU-PORTAL-01 | Expect the no-match message and no new chart |
| BUG-06 | RT-32, RT-33 | Activation failed or looked like a duplicate | One phone match activates one account | FIXED_LOCAL_TESTED | AC-FU-PORTAL-01, twice | Activate, open the profile, repeat registration and confirm one chart |
| BUG-07 | RT-28 | A new text section could not be edited | Section settings now save the new text | FIXED_LOCAL_TESTED | AC-FU-WEB-02 and the 390/768/1440 CMS suite, twice | Add, edit, preview, publish, reload |
| BUG-08 | RT-29 | A new image section could not be saved or previewed | Image section save requires alt text and stays draft until publish | FIXED_LOCAL_TESTED | AC-FU-WEB-02 and CMS suite, twice | Save the draft, confirm it is private, then publish |
| BUG-09 | RT-44 | Saved vitals had no correction | Correction appends a row and keeps the original | FIXED_LOCAL_TESTED | AC-REC-03, twice | Correct one value and confirm an unauthorized session cannot change it |
| BUG-10 | RT-56 | A received specimen could not take a result | Result entry follows collection and receipt | FIXED_LOCAL_TESTED | G224, twice | Enter one result and verify it |
| BUG-11 | RT-57 | Received work was not in the processing queue | Queue follows the stored status | FIXED_LOCAL_TESTED | G224, twice | Confirm the received request is in the processing queue |
| BUG-12 | RT-58 | Laboratory counts disagreed with the queue | Counts read persisted statuses | FIXED_LOCAL_TESTED | G224, twice | Compare the counters with the request rows |
| BUG-13 | RT-59 | Diagnostic counters disagreed | Laboratory and radiology counts read persisted rows | FIXED_LOCAL_TESTED | G224 and G229, twice | Compare both dashboards with the stored requests |
| BUG-14 | RT-60 | Radiology filters hid requests | Open, in-progress, and all follow the report lifecycle | FIXED_LOCAL_TESTED | G229, twice | Walk one request through the three filters |
| BUG-15 | RT-64 | Clinical documents did not print | Print regions are on the existing clinical pages | FIXED_LOCAL_TESTED | G168, G177, G224, and G229, twice | Print SOAP, prescription, vitals, laboratory, radiology, and referral for one QA chart |

Changed source for BUG-01 is `src/platform/email/resendOtpTransport.js`. BUG-04 through BUG-15 were already implemented in the local worktree and were re-executed rather than rewritten. No hosted file changed.
