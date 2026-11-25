# V2.13.2 G179 OTP migration approval package

This package is not a migration. `db/migrations/platform/048_otp_challenges.sql` stays absent. Contract tests require that path to be absent. No file was added under `db/migrations/`. Nothing was applied to `getpro_v13_e2e_g78d2301` or any other database.

`NEW_MIGRATIONS_EXECUTED=NO`.

D14C and D16 keep their current failure. They fail because `platform.otp_challenges` is absent. This package does not rewrite those tests, skip them, or turn `resolveOtpActivation` to `ACTIVE`.

## Source of the design

The reviewed column set is in `docs/qa/V13_G115_PLATFORM_OTP_MIGRATION_REVIEW.md`. The running engine already stores the richer binding in memory only, in `src/platform/otp/otpChallengeStore.js`. Limits already fixed in `src/platform/otp/otpPolicy.js` are the ones below. Environment variables cannot change them.

| Policy | Value |
| --- | --- |
| Code length | 6 |
| Expiry | 300 seconds |
| Max attempts | 5 |
| Resend cooldown | 60 seconds |
| Account hourly cap | 5 |
| Identifier hourly cap | 5 |
| Context hourly cap | 20 |
| Provider hourly cap | 30 |

Hashing already used by `hashOtpCode` is HMAC-SHA256 with a pepper of at least 32 characters from `GETPRO_OTP_PEPPER` or `SESSION_SECRET`. The plaintext code is discarded after hashing. Comparison is `timingSafeEqual`. The identifier and context are SHA-256 digests, not the raw address or phone.

## Exact table, when a later approval creates it

Proposed name: `platform.otp_challenges`.

Proposed file, only after a separate approval that also updates the contracts which forbid `048_otp_challenges.sql`: the next platform file after `047_approval_request_foundation.sql`. That file is not `048_otp_challenges.sql`. Do not edit migrations 043 or 044.

```sql
CREATE TABLE platform.otp_challenges (
  id uuid PRIMARY KEY,
  product_code text NOT NULL,
  organization_id uuid NULL REFERENCES platform.organizations (id),
  account_id uuid NOT NULL,
  session_id uuid NULL,
  attempt_id uuid NOT NULL,
  purpose text NOT NULL,
  action_key text NOT NULL,
  channel text NOT NULL,
  identifier_hash text NOT NULL,
  code_hash text NOT NULL,
  context_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  CONSTRAINT otp_challenges_product_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT otp_challenges_channel_check
    CHECK (channel IN ('email', 'sms')),
  CONSTRAINT otp_challenges_status_check
    CHECK (status IN ('pending', 'verified', 'expired', 'locked')),
  CONSTRAINT otp_challenges_attempts_check
    CHECK (attempt_count >= 0 AND max_attempts = 5 AND attempt_count <= max_attempts),
  CONSTRAINT otp_challenges_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT otp_challenges_verified_check
    CHECK (
      (status = 'verified' AND verified_at IS NOT NULL)
      OR (status <> 'verified' AND verified_at IS NULL)
    ),
  CONSTRAINT otp_challenges_hash_len_check
    CHECK (
      char_length(code_hash) = 64
      AND char_length(identifier_hash) = 64
      AND char_length(context_hash) = 64
    )
);

CREATE UNIQUE INDEX otp_challenges_attempt_uidx
  ON platform.otp_challenges (attempt_id);

CREATE INDEX otp_challenges_binding_idx
  ON platform.otp_challenges (product_code, account_id, purpose, channel, status, expires_at);

CREATE INDEX otp_challenges_org_purpose_idx
  ON platform.otp_challenges (organization_id, purpose, expires_at);
```

No column holds the code, the address, or the phone.

## Rules the future store must enforce

Tenant, product, and purpose isolation match `sameBinding` in the memory store. A row verifies only when product, account, purpose, and channel match, and when organization matches when the caller supplied one. A BlessBoard challenge cannot satisfy an ActiveClinic purpose.

The compare and the attempt increment run in one transaction. A wrong code increments `attempt_count`. At 5 the status becomes `locked`. An expired row is not accepted. A `verified` row is single-use: `verified_at` is set once and a second verify returns failure. That is the replay rejection.

Rate limits stay the policy caps above. The memory store's hourly buckets are process-local. A durable rate table is not part of this package and is not created here. Applying only `otp_challenges` does not remove the in-memory caps and does not activate delivery.

`resolveOtpActivation` stays `BLOCKED` unless a test passes the explicit `ACTIVE` override. Production signals stay blocked. Creating the table does not configure a provider and does not verify a release. Those three reasons in `otpActivation.js` remain.

## Ordering and compatibility

Apply only after platform migration 047, and only on a database that already has `platform.organizations`. Existing `blessboard.phone_otp_verifications` and `public.intake_phone_otp` stay untouched. The unit-test memory store stays the store until a later change switches the engine. This cycle does not switch it.

D14C and D16 must still fail on a database without the table. After a future apply they must still fail when activation is `BLOCKED`, when the purpose or product does not match, when the code is wrong, when the attempt cap is reached, and when a verified challenge is presented again. They must not be converted to skips.

## Rollback and forward repair

If the table is applied later and contains no `verified` rows, rollback is `DROP TABLE platform.otp_challenges`. If any row is `verified`, do not drop it. Forward repair is an additive migration that adds a missing column or index. Do not rewrite hashes in place and do not backfill a plaintext code.

## Isolated test plan, not run here

1. Apply the approved file only on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432` after a separate approval. Do not use port 5432.
2. Insert one synthetic challenge with a hash. Read it back. Confirm the row has no code column value that equals a 6-digit code.
3. Wrong code increments `attempt_count` by 1 and leaves status `pending` until the fifth failure, which locks it.
4. Correct code on a pending, unexpired, matching binding sets `verified` once. A second verify does not change another row and does not succeed.
5. A different product, purpose, organization, or account does not consume the row.
6. An expired row is rejected and stock or membership rows are unchanged. This table has no stock effect.
7. `resolveOtpActivation` without the test override is still `BLOCKED`.
8. D14C and D16 are re-run. They pass only if the assertions above hold. A missing table, a skipped assertion, or an activation bypass is still a failure.

None of those steps were executed in G179.
