# V2134 G322 final handoff

FINAL=V2134_G322_EXTERNAL_QA_RECONCILIATION

The original Christine Manjombi DOCX was not accessible. The reported date remains 28/11/2025. Historical totals remain 64 scenarios, 48 PASS, and 16 FAIL. Individual bug IDs were not transcribed.

G321 commits `27a940e7809bd2f01ee22e9032443414b76a8dfa` and `0458ad806921033319031ad70d81bd8d1aaa6f98` stay on `V13`. `main` was not changed. Nothing was deployed.

## Local result

| Check | Result |
| --- | --- |
| Safe tests | 682 pass, 0 fail, twice |
| HTTP and PostgreSQL | 41 pass, 0 fail, twice |
| ActiveClinic browser | 33 pass, 0 fail, twice |
| Patient portal | Local pass for activation, duplicate refusal, tenant isolation, and testing reset |
| New text section | Local pass |
| New image section | Local pass by authorized image reference |
| Vitals correction | Local pass, including PostgreSQL history and vitals-log print |
| Laboratory | Local pass for FBC lifecycle, filters, and counters |
| Radiology | Local pass for filters and report lifecycle |
| Clinical printing | Local pass for SOAP, referral, prescription, vitals log, laboratory, and radiology |
| Live email OTP | NO |
| Hosted retest | NOT_PERFORMED |

## Still open

P0: `OTP-LIVE-MAILBOX`, `OTP-MIGRATION-048`, `PUBLIC-BOOKING`.  
P1: `CB-POSTING`, `HOSTED-RETEST`.  
P2: none.

QA_GO_NO_GO=NO-GO. Full acceptance waits for the hosted tester to execute `docs/qa/V2134_G322_HOSTED_RETEST_SCRIPT.md` against the deployed G322 commit. The 48 untranscribed rows also stay unaccepted.

The next operator action is a separate deployment approval, then the hosted script. Live Resend remains a separate NO-GO until a received message completes the protected action.
