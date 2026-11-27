# V2134 G320 full regression

FINAL=V2134_G320_FULL_REGRESSION

Base preserved: G318 `cee1286e830a92845d44f6c6a17cd581de2042f0` and G319 `7b9b31d0c478188382d5802539bd60f9b9aebdf3`.

Disposable database only: `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. No migration 048, no real email, no hosted setting change, no deployment, and no `main` commit.

## Fixes

1. The authorized D25 case threw `APT-01-03_OPTION_C_POLICY` while expecting `NOT_RUN`. It now asserts the approved Option C rule: assigned-staff non-overlap is the capacity rule, `evaluateSlotCapacity` stays `BLOCKED_APPROVAL_REQUIRED`, and the appointment service has no `slot_capacity`. Unauthorized runs remain `NOT_RUN`. No slot-capacity integer was added. Overlap and concurrent booking stayed in the same suite.
2. The second HTTP pass failed AC-WEB-09 because a D05 clinic phone used the last seven digits of the clock. That suffix already belonged to an older disposable identity that shared the synthetic registration password, so registration reused that identity and the new email could not sign in. Registration and patient phones in the D05 runner now use a random national number. Registration reuse policy was not changed.

## Execution

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe contract and unit | 682 pass, 0 fail, 0 skipped | 682 pass, 0 fail, 0 skipped |
| Authorized HTTP on g78 | 41 pass, 0 fail, 0 skipped | 41 pass, 0 fail, 0 skipped |
| BlessBoard browser regression | 23 pass | 23 pass |
| BlessBoard member-login OTP | 10 pass | 10 pass |
| ActiveClinic browser regression | 32 pass | 32 pass |
| ActiveClinic recovery email OTP | 9 pass | 9 pass |
| Community Benefits mock browser | 9 pass | 9 pass |

Community Benefits PostgreSQL persistence passed inside both HTTP runs. OTP PostgreSQL passed inside both HTTP runs: D14C, D16 ActiveClinic auth, D16 shared OTP, G185, and G272. AC-05 passed in both ActiveClinic browser runs and in D16 HTTP. D14C staff login stayed fail-closed in the BlessBoard regression. AC-AUTH-04 remains the reset-link journey and is not email-OTP evidence.

Laboratory, radiology, referral print, prescription print, walk-in, vitals correction, patient search, and queue filters are inside the ActiveClinic browser regression that passed twice. Public booking stayed disabled. Financial posting stayed disabled.

## Status

| Item | Result |
| --- | --- |
| D14C | PASS |
| D16 | PASS |
| D25 | PASS |
| AC-05 | PASS |
| Community PostgreSQL | PASS |
| OTP PostgreSQL | PASS |
| Live mailbox | BLOCKED_BY_EXTERNAL_PROVIDER |
| Migration 048 | BLOCKED_BY_SCHEMA |
| Public booking | DISABLED_BY_POLICY |
| Community posting | DISABLED_BY_POLICY |
| Hosted health label | BLOCKED_BY_HOSTED_DEPLOYMENT |

`src/platform/runtime/buildIdentity.js` still prefers the live `GETPRO_GIT_BRANCH` value. The hosted V11 label is that panel value. Hosted settings were not modified.

Remaining issue IDs: `OTP-LIVE-MAILBOX`, `OTP-MIGRATION-048`, `PUBLIC-BOOKING`, `CB-POSTING`, `HOSTED-RETEST`.

No failed case was recorded as skipped. G321 was not specified in this request.
