# V2.13.2 G184 OTP contract reconciliation

The reviewed script `docs/qa/V2132_G181_OTP_CHALLENGES.sql` stays unapplied. `db/migrations/platform/048_otp_challenges.sql` was not created. No database received `platform.otp_challenges`.

## Match against the service

| Contract | Service | Reviewed SQL |
| --- | --- | --- |
| Organization | Required UUID | `organization_id uuid NOT NULL` |
| Product | `blessboard` or `activeclinic` | Same check |
| Purpose and action | Stored on the challenge | `purpose` and `action` are required |
| Status | `pending`, `verified`, `expired`, `cancelled`, `exhausted` | Same check |
| Consumed | Set only by `consumeVerified` | `consumed boolean NOT NULL DEFAULT false` |
| Last send | Set when the row is inserted | `last_sent_at timestamptz NOT NULL` |
| Rate limits | Account, identifier, context, and provider hourly caps | `platform.otp_rate_buckets` |
| Hash | HMAC-SHA256, 64 hex characters | Length check, no code column |
| Expiry | 300 seconds, then status `expired` | `expires_at > created_at` |
| Attempts | 5, then `exhausted` | `max_attempts = 5` and count cannot pass 5 |
| Replay | A verified row cannot verify again. Consumption succeeds once | Unique `attempt_id`, conditional `consumed = false` update |
| Tenant | Organization mismatch returns `cross_tenant` and does not consume | Organization is part of the pending index |

The D14A design snippet omits `last_sent_at`. The reviewed script includes it because the service writes it. That is the only schema correction, and it was already in the G181 script.

## What the table still does not close

D14C fails because `to_regclass('platform.otp_challenges')` is null. D16 uses the same assertion, then expects `verifyChallenge` on a second `createOtpService()` to return `sessionComplete: true`.

Those two calls do not share a store unless a pool or repository is injected. `verifyChallenge` still returns `sessionComplete: false`. `completeProtectedAction` is the step that returns `sessionComplete: true`, and only once. The HTTP OTP environment also has no pepper. Creating the table does not make either test pass. Neither assertion was changed.
