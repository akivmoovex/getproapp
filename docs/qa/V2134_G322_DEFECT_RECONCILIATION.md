# V2134 G322 defect reconciliation

Date of this review: 28 November 2026.  
Historical report date, unchanged: 28/11/2025.  
Candidate before this review: `0458ad806921033319031ad70d81bd8d1aaa6f98`.  
G321 verified suite candidate `27a940e7809bd2f01ee22e9032443414b76a8dfa` remains an ancestor.

ORIGINAL_DOCUMENT=NOT_ACCESSIBLE. The 15 consolidated bug IDs named by the report were not in the transcription, so this reconciliation does not invent them.

## What changed

No product rule was widened.

- AC-FU-PORTAL-05 now completes patient testing recovery: staff-created chart, one portal identity, testing reset token, denial of the old password, sign-in with the replacement, one patient row, and one consumed reset token. The page still says delivery is unavailable.
- AC-REC-03 clicks Print vitals log and checks that the print region still shows 72 bpm and 80 bpm.
- The authorized HTTP vitals case reads `activeclinic.vital_sign_observations` and requires the original 72 row to remain, with the 80 row pointing at it and keeping the reason.
- The browser journey count contract is 33 because that new portal case exists.

Public booking, financial posting, production OTP, SMS, and production media uploads stay disabled.

## Local execution after the change

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe contract and unit | 682 pass, 0 fail | 682 pass, 0 fail |
| Authorized HTTP and PostgreSQL | 41 pass, 0 fail | 41 pass, 0 fail |
| ActiveClinic browser | 33 pass, 0 fail | 33 pass, 0 fail |

The first safe pair failed one discovery assertion that still expected 32 browser journeys. The expected count was updated to 33 and the safe pair above was run after that update.

## Classification totals

| Class | Count |
| --- | --- |
| FIXED_VERIFIED_LOCALLY | 13 |
| DISABLED_BY_APPROVED_POLICY | 2 |
| BLOCKED_BY_PROVIDER | 1 |
| NOT_TESTED | 48 |
| OPEN_DEFECT | 0 |
| PASS_HOSTED | 0 |

The 13 local fixes still require a hosted tester retest. They are not accepted as hosted passes.

## Provider and policy

RT-07 stays blocked. No Resend message was received, and no received code completed a protected action.  
RT-08 stays deferred. SMS is outside the approval register.  
RT-03 stays disabled. The local test checks the disabled booking page and does not enable booking.
