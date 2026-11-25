# V2.13.2 G181 OTP migration readiness

G180 evidence remains `3a8d7c434c8a7f8bdfc75c5c0e3bb2fc4ec7023c`. This cycle does not apply a migration and does not create `platform.otp_challenges`. D14C and D16 stay failed.

`OTP_MIGRATION_EXECUTED=NO`.

## What D14C and D16 assert

`runD14cOtp` asserts `resolveOtpActivation` stays `BLOCKED` when `NODE_ENV` and `DEPLOYMENT_ENV` are `production`, even if the override is `ACTIVE`. It then calls `runPlatformOtp`.

`runPlatformOtp` asserts `to_regclass('platform.otp_challenges')` is present. On G180 that assertion failed, so the later lines did not run. Those later lines create two `createOtpService()` instances and expect the second `verifyChallenge` to return `sessionComplete: true` for code `1234`.

The service does not do that today, even on one shared store:

- `createOtpService()` uses `createMemoryOtpStore()` unless a store is passed. A second call cannot see the first challenge.
- `verifyChallenge` sets `sessionComplete: false` after a correct code.
- `completeProtectedAction` is what sets `sessionComplete: true`, and only once. A second completion is rejected.
- `runPlatformOtp` does not set `GETPRO_OTP_PEPPER`. `beginChallenge` returns `pepper` before `issued: true` when the pepper is shorter than 32 characters.

Applying a table does not make D16 pass. This cycle does not change those assertions and does not change `verifyChallenge`.

## Schema that matches the source

`docs/platform/V213_D14A_OTP_FOUNDATION.md` is the design the service implements. `docs/qa/V2132_G179_OTP_MIGRATION_APPROVAL_PACKAGE.md` does not match it: that draft used nullable `organization_id`, status `locked`, and no `consumed` or `last_sent_at`. The service requires the opposite.

The reviewed script is `docs/qa/V2132_G181_OTP_CHALLENGES.sql`. It is not under `db/migrations/`. `db/migrations/platform/048_otp_challenges.sql` stays absent because D14A, D26, D38, D41, and G112 require that path to be absent.

| Requirement | Reviewed script |
| --- | --- |
| Filename | Not `048_otp_challenges.sql`. A later approval may copy it to the next platform number after `047_approval_request_foundation.sql` only in the same change that updates those contracts. |
| Prerequisite | `platform.organizations` from platform migration 006. |
| Product isolation | `product_code` is `blessboard` or `activeclinic`. |
| Tenant isolation | `organization_id` is `NOT NULL` and references `platform.organizations`. |
| Hash | `code_hash`, `identifier_hash`, and `context_hash` are 64 characters. No code, email, or phone column. |
| Expiry | `expires_at > created_at`. The service uses 300 seconds. |
| Attempts | `max_attempts = 5` and `attempt_count` cannot exceed 5. Status becomes `exhausted`. |
| Replay | `consumed` starts false. `verified_at` is set only when status is `verified`. |
| Resend | `last_sent_at` is required. The D14A snippet omitted it. The service writes it. |
| Rate limits | `platform.otp_rate_buckets` holds the existing hourly counters. Caps stay 5, 5, 20, and 30. |
| Statuses | `pending`, `verified`, `expired`, `cancelled`, `exhausted`. |

## Operator approval, not execution

Target, only after a separate approval:

- Host `127.0.0.1`
- Port `55432`
- Database `getpro_v13_e2e_g78d2301`

Do not use port 5432. Do not apply this on a hosted database. Do not set OTP activation to `ACTIVE`.

Order when that approval exists:

1. Confirm `current_database()` and `inet_server_port()` before any statement.
2. Update the contracts that forbid `048_otp_challenges.sql` in the same change that adds the migration file. Do not add that filename while those tests still forbid it.
3. Apply the reviewed statements once. They are additive. They do not alter appointments, stock, or existing OTP tables.
4. If the apply fails before commit, the transaction rolls back and neither table remains.
5. If both tables exist and no row is `verified`, rollback is `DROP TABLE platform.otp_rate_buckets, platform.otp_challenges`. If any row is `verified`, do not drop the table. Repair forward by adding a missing column only.
6. Re-run D14C and D16. They stay failed until a later change gives both workers one store and the D16 assertion matches `completeProtectedAction`. That later change is not this cycle.

`tests/v13/unit/g181-otp-readiness.test.js` locks the column list, the absent `048` path, the unchanged D16 text, the separate memory worker, and the single completion.
