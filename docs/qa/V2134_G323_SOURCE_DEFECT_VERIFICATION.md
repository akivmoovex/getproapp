# V2134 G323 source defect verification

Parent: `f167ae260c32197e368f1bf484325c18e9465db8`.  
Database: disposable `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.  
Products in source: BlessBoard and ActiveClinic `2.13.4` (`PRODUCT_VERSION_V8`).

No product route, template, or migration was changed in G323. The new evidence is in the authorized HTTP runner and the ActiveClinic browser journey.

## What was rechecked

| Journey | Evidence | Result |
| --- | --- | --- |
| Patient portal activation and sign-in | AC-FU-PORTAL-01 | PASS |
| Duplicate account handling | Unknown phone refused; one patient row | PASS |
| Portal password recovery | AC-FU-PORTAL-05 testing token only. Page still says delivery is unavailable | PASS |
| Staff testing recovery | AC-AUTH-04 after clearing the disposable identifier rate-limit row | PASS |
| New website text section | AC-FU-WEB-02 | PASS |
| New website image section | Authorized `example.invalid` reference, private until publish | PASS |
| Vitals correction and audit history | Browser print region shows 72 bpm and 80 bpm. SQL keeps both rows and the correction reason | PASS |
| Laboratory result entry | G224 received, result, second verifier, clinician read-back | PASS |
| Laboratory filters and counters | Received filter matches; processing filter excludes it; received counter is 1 | PASS |
| Diagnostics counters | `/app/diagnostics` card values equal `GROUP BY status` for `pending_collection`, `processing`, radiology `pending`, and radiology `in_progress` | PASS |
| Radiology lifecycle | G229 filters, report, verification, clinician read-back | PASS |
| Clinical printing | SOAP, referral, prescription, laboratory, radiology, vitals log | PASS |
| Patient and clinic authorization | Wrong clinic refused; unauthorized session cannot change the vital | PASS |

Testing-mode recovery stores a token for the disposable test process. It does not send mail and does not prove a mailbox.

## Suite pair after the final test edits

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe contract | 682 pass, 0 fail | 682 pass, 0 fail |
| HTTP and PostgreSQL | 41 pass, 0 fail | 41 pass, 0 fail |
| ActiveClinic browser | 33 pass, 0 fail | 33 pass, 0 fail |

The browser pair above is the pair after the rate-limit isolation. An earlier pair in this cycle was 33 pass, then 32 pass and 1 fail (`AC-AUTH-04` delivery lookup 404). That failure is recorded in the mapping. It is not counted as a pass.

## Classifications that stay closed

Public booking remains disabled and is tested as disabled.  
SMS recovery remains disabled.  
Community Benefits financial posting remains disabled.  
None of those is marked as a fixed defect.

SOURCE_DEFECTS_OPEN=0 among the transcribed journeys.  
LOCALLY_VERIFIED=13 (`RT-28`, `RT-29`, `RT-30`, `RT-31`, `RT-32`, `RT-33`, `RT-44`, `RT-56`, `RT-57`, `RT-58`, `RT-59`, `RT-60`, `RT-64`).  
POLICY_DISABLED=`RT-03`, `RT-08`, Community Benefits posting.  
PROVIDER_BLOCKED=`RT-07`.  
HOSTED_RETEST_REQUIRED=all 16 transcribed rows. The 48 untranscribed rows are NOT_RUN, not hosted passes.
