# V2134 OTP live QA evidence

## Disposable PostgreSQL

Reviewed schema applied on `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`.

Verified objects:

- `platform.otp_challenges`
- `platform.otp_rate_buckets`
- unique attempt index
- pending lookup index
- product/channel/status/hash/attempt/verified constraints
- role SELECT/INSERT/UPDATE/DELETE on the tables

`db/migrations/platform/048_otp_challenges.sql` remains absent by contract.

## Automated OTP evidence

- D14C integration: PASS after schema apply (g79 dual runs)
- D16 platform OTP integration: PASS after schema apply (g79 dual runs)
- G185 two-worker shared persistence: PASS (unique accountId/identifier per run to avoid hourly rate-bucket collision)
- Production activation remains closed in the D14C production-signal check
- Fixed testing code remains gated to the testing deployment profile
- Replay after atomic consumption is rejected
- Cross-tenant verification is denied
- Missing pepper remains fail-closed in unit coverage
- Rate limiting, expiration, attempt counting, and protected-action completion covered by D14C/D16/G185

No plaintext OTP codes are recorded in this file.

## Real Resend mailbox delivery

NOT EXECUTED in this cycle.

| Check | Result |
| --- | --- |
| `RESEND_API_KEY` in agent environment | unset |
| Approved QA secret store access | unavailable to agent |
| Exact allowlisted QA recipients | not supplied outside Git |
| Non-OTP smoke send | NOT STARTED (preflight failed) |
| Mailbox receipt proof | NOT EXECUTED |
| OTP browser E2E (AC/BB) | NOT EXECUTED |

A provider 2xx alone would not have counted as mailbox proof.

Operator action required before live email OTP browser proof:

1. Confirm Resend verification for `pronline.org`
2. Store a sending-only key in the approved QA secret store
3. Supply the exact allowlisted QA recipients outside Git
