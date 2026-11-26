# V2132 G266 open defects

## Fixed this cycle

| ID | Severity | Status | Summary |
| --- | --- | --- | --- |
| G266-01 | P1 | FIXED | Laboratory result components persisted but were not loaded/rendered on request detail or print region. Fixed loader + EJS + unit/HTTP/browser assertions. |
| G266-02 | P1 | FIXED | D21 symlink isolation negative used `os.tmpdir()` (`/tmp` when TMPDIR unset), so shared-temp refusal fired before symlink denial. Fixture moved under project `.v13-isolated-pg` scratch. |

## Remaining open / blocked

| ID | Severity | Status | Blocker |
| --- | --- | --- | --- |
| LIVE-OTP-MAILBOX | P0 | BLOCKED | Resend key unset; domain verification NOT_OBSERVED; no live email authorized |
| D25-SLOT | P1 | UNAPPROVED | Expected HTTP fail `APT-01-03_NOT_IMPLEMENTED` / BLOCKED_APPROVAL_REQUIRED |
| CLINICAL-PRINT-DEPTH | P1 | PARTIAL | Lab/rad print regions now carry content; SOAP/referral/patient-card hosted visual parity still open |
| CB-POSTING | P1 | DISABLED | Financial posting and agreement activation remain unapproved |
| PUBLIC-BOOKING | P0 | DISABLED | Policy preserved |
| MIGRATION-048 | P0 | NOT_APPLIED | Shared/production OTP schema not applied this cycle |
| HOSTED-RETEST | P1 | BLOCKED | Separate operator authorization required |

No independently actionable P0 clinical defect remains open after G266-01/G266-02 without an external policy or provider gate.
