# V2134 G281 master open QA register

Start tip: `e820951d` (prompt BASE_SHA `8ef0a151` not current; tip preserved).  
Versions: BlessBoard/ActiveClinic **2.13.4**. November 25 DOCX reports: **unavailable**.

Machine-readable twin: `V2134_G281_MASTER_OPEN_QA_REGISTER.json`.

| ID | Severity | Status | Blocker / evidence |
| --- | --- | --- | --- |
| OTP-LIVE-MAILBOX | P0 | BLOCKED_BY_PROVIDER | Resend key/domain/allowlist |
| OTP-MIGRATION-048 | P0 | BLOCKED_BY_SCHEMA | Shared/hosted apply unapproved |
| D14C-D16 | P0 | VERIFIED_DISPOSABLE | Live mailbox still blocked |
| D25-SLOT | P1 | BLOCKED_BY_POLICY | G183 decision pending |
| D25-OVERLAP | P0 | VERIFIED | HTTP concurrency |
| LAB-E2E | P0 | VERIFIED | G224/G266 |
| RAD-E2E | P0 | VERIFIED | G229 |
| PRINT-SOAP-IDENTITY | P1 | FIXED_THIS_CYCLE | SOAP print now includes patient + chief complaint |
| PUBLIC-BOOKING | P0 | DISABLED_BY_POLICY | Preserved |
| CB-POSTING | P1 | DISABLED_BY_POLICY | posting_disabled |
| HOSTED-RETEST | P1 | BLOCKED_BY_ENVIRONMENT | Deploy approval |
| AC-05 | P0 | VERIFIED | Preserved |

No issue removed without evidence. Historical 2.13.2 QA docs preserved.
