# V2134 G335 fifteen-bug status

Hosted clinical flows were not re-executed. Health checks are not a pass for these rows.

| Bug | Local | Hosted | Remaining blocker | Christine |
| --- | --- | --- | --- | --- |
| BUG-01 RT-07 email OTP | Adapter and mock tests pass. No mailbox | NOT_RUN | No key, no allowlist, SPF is Hostinger-only, migration 048 is not on the host | Do not treat a testing code as this row |
| BUG-02 RT-08 SMS reset | DEFERRED_BY_POLICY | NOT_RUN | SMS stays off | Confirm the page does not claim an SMS was sent |
| BUG-03 RT-03 public booking | Denial tested. Policy stays disabled | NOT_RUN until the deployed SHA is checked | Do not enable booking | Confirm the booking page stays unavailable |
| BUG-04 RT-30 existing patient login | FIXED_LOCAL_TESTED | NOT_RUN | Needs a hosted chart retest after this deploy | Activate one chart, then sign in to that clinic |
| BUG-05 RT-31 self-registration | PRODUCT_DECISION | NOT_RUN | Unmatched registration must not create a chart | Expect the no-match message |
| BUG-06 RT-32 RT-33 activation | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Activate, open the profile, confirm one chart |
| BUG-07 RT-28 text section | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Add, edit, preview, publish, reload |
| BUG-08 RT-29 image section | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Save the draft privately, then publish |
| BUG-09 RT-44 vital correction | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Correct one value and confirm the original remains |
| BUG-10 RT-56 laboratory result | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Enter and verify one result |
| BUG-11 RT-57 laboratory filter | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Confirm the received request is in the processing queue |
| BUG-12 RT-58 laboratory counters | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Compare counters with stored requests |
| BUG-13 RT-59 diagnostics counters | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Compare laboratory and radiology dashboards |
| BUG-14 RT-60 radiology filters | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Walk one request through Open, In Progress, and All |
| BUG-15 RT-64 clinical printing | FIXED_LOCAL_TESTED | NOT_RUN | Hosted retest | Print SOAP, prescription, vitals, laboratory, radiology, and referral |

Local evidence is the ActiveClinic browser file, the HTTP file, the CMS viewport file, and the OTP browser files, each run twice in G334.
