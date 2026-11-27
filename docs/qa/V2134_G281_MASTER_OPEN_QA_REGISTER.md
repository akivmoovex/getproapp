# V2134 G281 master open QA register

Start tip: `e820951d` (prompt BASE_SHA `8ef0a151` not current; tip preserved).  
Versions: BlessBoard/ActiveClinic **2.13.4**. November 25 DOCX reports: **unavailable**.  
G320 refresh: 27 November 2026, disposable database `getpro_v13_e2e_g78d2301` only. Evidence: `V2134_G320_FULL_REGRESSION.md`.

Machine-readable twin: `V2134_G281_MASTER_OPEN_QA_REGISTER.json`.

| ID | Severity | Status | Blocker / evidence |
| --- | --- | --- | --- |
| OTP-LIVE-MAILBOX | P0 | BLOCKED_BY_EXTERNAL_PROVIDER | Resend key, domain, and allowlist still absent; no live send |
| OTP-MIGRATION-048 | P0 | BLOCKED_BY_SCHEMA | `db/migrations/platform/048_otp_challenges.sql` stays absent |
| D14C-D16 | P0 | VERIFIED_DISPOSABLE | HTTP plus BB D161 10/10 and AC recovery OTP 9/9, twice; live mailbox remains OTP-LIVE-MAILBOX |
| D25-SLOT | P1 | VERIFIED_OPTION_C | Assigned-staff non-overlap is the capacity rule; no slot-capacity integer |
| D25-OVERLAP | P0 | VERIFIED | HTTP overlap and concurrent booking, twice |
| LAB-E2E | P0 | VERIFIED | G224 browser twice and G03 HTTP twice |
| RAD-E2E | P0 | VERIFIED | G229 browser twice |
| PRINT-SOAP-IDENTITY | P1 | VERIFIED | G168 referral print and G177 prescription print, twice |
| PUBLIC-BOOKING | P0 | DISABLED_BY_POLICY | AC-PUB-01 stays disabled; booking_enabled count 0 |
| CB-POSTING | P1 | DISABLED_BY_POLICY | PostgreSQL persistence passed; posting stays disabled |
| HOSTED-RETEST | P1 | BLOCKED_BY_HOSTED_DEPLOYMENT | Source prefers live `GETPRO_GIT_BRANCH`; hosted panel was not changed |
| AC-05 | P0 | VERIFIED | Browser denial twice and D16 HTTP twice |

No issue removed without evidence. Historical 2.13.2 QA docs preserved.
