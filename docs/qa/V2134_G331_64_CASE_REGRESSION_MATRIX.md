# V2134 G331 64-case regression matrix

The historical local sheet is `docs/qa/V2134_G325_64_CASE_LOCAL_COMPLETION.md`. This session did not re-run those 64 scripts one by one. It re-ran the contract suite, the isolated HTTP suite, the ActiveClinic platform browser, the BlessBoard platform browser, and the OTP browsers. Those suites include the tests named in the G325 sheet. A row below is not a new hosted pass.

Hosted results are only the anonymous reads in `docs/qa/V2134_G331_HOSTED_SMOKE_RESULTS.md`.

| ID | G325 local | This session | Hosted this session |
| --- | --- | --- | --- |
| RT-01 | PASS | Not a separate script. Public origin returned 200 on the host | Anonymous GET 200. Not the full historical script |
| RT-02 | PASS | Not a separate script. Published clinic page returned 200 | Anonymous GET 200. Not the full historical script |
| RT-03 | POLICY_DISABLED | AC-PUB-01 inside both HTTP runs. GET and POST 403. No booking row | GET 403 on both formerly open clinic URLs. No POST |
| RT-04 | PASS | Administrator login inside the ActiveClinic browser run | NOT_RUN |
| RT-05 | PASS | G165 logout inside that browser run | NOT_RUN |
| RT-06 | PASS | Wrong-password case inside that browser run | NOT_RUN |
| RT-07 | BLOCKED_BY_PROVIDER | Synthetic OTP only. No mailbox | NOT_RUN. Still blocked |
| RT-08 | POLICY_DISABLED | Not re-opened. SMS stays off | NOT_RUN |
| RT-09 | PASS | AC-REG-01 inside the ActiveClinic browser run | NOT_RUN |
| RT-10 | PASS | Same registration case | NOT_RUN |
| RT-11 | PASS | G325 workspace case inside the ActiveClinic browser run | NOT_RUN |
| RT-12 | PASS | Same workspace case | NOT_RUN |
| RT-13 | PASS | Staff login and department denials inside that browser run | NOT_RUN |
| RT-14 | PASS | AC-WEB-08 inside that browser run | NOT_RUN |
| RT-15 | PASS | Same website case | NOT_RUN |
| RT-16 | PASS | Same website case | NOT_RUN |
| RT-17 | PASS | G325 website upload inside that browser run | NOT_RUN |
| RT-18 | PASS | Same upload case | NOT_RUN |
| RT-19 | PASS | Same upload case | NOT_RUN |
| RT-20 | PASS | Same upload case | NOT_RUN |
| RT-21 | PASS | Same upload case. Service stays non-bookable | NOT_RUN |
| RT-22 | PASS | Same upload case | NOT_RUN |
| RT-23 | PASS | Same upload case | NOT_RUN |
| RT-24 | PASS | Same upload case | NOT_RUN |
| RT-25 | PASS | AC-WEB-09 inside the ActiveClinic browser run | NOT_RUN |
| RT-26 | PASS | Same theme case | NOT_RUN |
| RT-27 | PASS | Same theme case | NOT_RUN |
| RT-28 | PASS | AC-FU-WEB-02 inside that browser run | NOT_RUN |
| RT-29 | PASS | Same section case | NOT_RUN |
| RT-30 | PASS | AC-FU-PORTAL-01 inside that browser run | NOT_RUN |
| RT-31 | PRODUCT_DECISION | PAT-01 and portal activation inside that browser run. Unmatched registration stays refused | NOT_RUN |
| RT-32 | PASS | AC-FU-PORTAL-01 | NOT_RUN |
| RT-33 | PASS | AC-FU-PORTAL-01 | NOT_RUN |
| RT-34 | PASS | G165 inside that browser run | NOT_RUN |
| RT-35 | PASS | G165 | NOT_RUN |
| RT-36 | PASS | G165 | NOT_RUN |
| RT-37 | PASS | G165 | NOT_RUN |
| RT-38 | PASS | AC-REC-02 and portal activation | NOT_RUN |
| RT-39 | PASS | AC-REC-02 | NOT_RUN |
| RT-40 | PASS | AC-REC-02 | NOT_RUN |
| RT-41 | PASS | AC-FU-REC-03 | NOT_RUN |
| RT-42 | PASS | AC-FU-REC-04 | NOT_RUN |
| RT-43 | PASS | AC-REC-03 | NOT_RUN |
| RT-44 | PASS | AC-REC-03 | NOT_RUN |
| RT-45 | PASS | G168 inside the ActiveClinic browser run | NOT_RUN |
| RT-46 | PASS | G168 | NOT_RUN |
| RT-47 | PASS | G168 | NOT_RUN |
| RT-48 | PASS | G168 | NOT_RUN |
| RT-49 | PASS | G168 and G177. No payment posting | NOT_RUN |
| RT-50 | PASS | G168 follow-up | NOT_RUN |
| RT-51 | PASS | G168 referral print region | NOT_RUN |
| RT-52 | PASS | G224 | NOT_RUN |
| RT-53 | PASS | G229 | NOT_RUN |
| RT-54 | PASS | G224 | NOT_RUN |
| RT-55 | PASS | G224 | NOT_RUN |
| RT-56 | PASS | G224 | NOT_RUN |
| RT-57 | PASS | G224 | NOT_RUN |
| RT-58 | PASS | G224 | NOT_RUN |
| RT-59 | PASS | HTTP laboratory and radiology runners inside both HTTP runs | NOT_RUN |
| RT-60 | PASS | G229 | NOT_RUN |
| RT-61 | PASS | G229. Reception denied | NOT_RUN |
| RT-62 | PASS | G229 | NOT_RUN |
| RT-63 | PASS | G229. Author does not verify their own report | NOT_RUN |
| RT-64 | PASS | Print regions inside G168, G177, AC-REC-03, G224, and G229 | NOT_RUN |

Counts for this session: hosted full-case PASS = 0. Hosted anonymous observations = RT-01, RT-02, and RT-03. Policy disabled = RT-03 and RT-08. Provider blocked = RT-07. Chart-first refusal = RT-31. The other hosted rows are NOT_RUN.

Local PASS remains the G325 column for the 60 supported rows. This session’s browser and HTTP runs exercised the tests named above and did not produce a failure. That is not a claim that every historical sentence was retyped today.
