# V13 D14A — Shared OTP foundation

Status: designed and implemented in process. Delivery is not activated. No migration has been applied.

BlessBoard and ActiveClinic use one OTP engine, `src/platform/otp`. Product code is an argument. There is no second engine.

## Policy

| Control | Value |
|---|---|
| Production code | 6 cryptographic digits |
| Expiry | 5 minutes |
| Verification attempts | 5 |
| Resend cooldown | 60 seconds |
| Account / identifier cap | 5 starts per hour |
| Context cap | 20 starts per hour |
| Testing code | `1234` |
| Delivery | inactive |

Mandatory actions: `auth.login`, `auth.password_recovery`, `auth.account_activation`, `admin.role_change`, `admin.member_export`, `admin.security_setting`.

`completeProtectedAction` returns `sessionComplete: true` only after a matching single-use verification. A begin result never completes a session.

The fixed code is accepted only when all of these agree:

- `GETPRO_OTP_ALLOW_FIXED_CODE=1`
- `DEPLOYMENT_ENV=testing`
- `DATABASE_IDENTITY_ENV=testing`
- `NODE_ENV` is not `production`
- `PLATFORM_DEPLOYMENT_CODE` resolves to a profile whose deployment environment and database environment are `testing`
- that profile has an expected identity key
- `DATABASE_IDENTITY_EXPECTED` equals that key

Any production signal rejects the fixed code. Production startup throws `otp_test_config_forbidden` when a test OTP setting or a weakened policy value is present. Startup does not turn delivery on.

## Threat model

| Threat | Control |
|---|---|
| Test code used in production | Production signals reject `1234` and startup refuses the test flag |
| Guessing | 5 attempts, then the challenge is exhausted |
| Replay | Verified and consumed challenges do not verify or complete again |
| Expired code | Pending challenges past 5 minutes are marked expired and rejected |
| Resend flood | 60-second cooldown plus hourly caps on account, identifier, and context |
| Cross-tenant use | Organization id must match. A mismatch does not consume the challenge |
| Purpose swap | Login, recovery, activation, and admin operations do not accept each other's purpose |
| Session bypass | Admin actions require the bound session. Completion re-reads the stored challenge |
| Account enumeration | Pre-auth begin always returns `{ ok: true, status: "accepted" }` |
| Plaintext theft | Only an HMAC is stored. The code is not returned, logged, or audited |
| Fail open | Unknown actions, missing pepper, limiter failure, and inactive delivery do not complete a session |
| Message send | Provider `deliver` is not called. `deliveryActivated` must stay false |

## Migration design (do not execute)

Apply only under a later authorized change. Do not run this statement in D14A.

```sql
-- NOT APPLIED. Design only.
CREATE TABLE IF NOT EXISTS platform.otp_challenges (
  id UUID PRIMARY KEY,
  product_code TEXT NOT NULL CHECK (product_code IN ('blessboard', 'activeclinic')),
  organization_id UUID NOT NULL,
  account_id UUID NOT NULL,
  session_id UUID NULL,
  attempt_id UUID NOT NULL,
  action TEXT NOT NULL,
  purpose TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  identifier_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL CHECK (char_length(code_hash) = 64),
  context_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'expired', 'cancelled', 'exhausted')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts = 5),
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS platform.otp_rate_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0)
);
```

No column holds the OTP, an email address, or a phone number. Audit rows go through the existing redacting audit recorder and must use reason codes only. The in-memory store is the D14A implementation. It is not a production data store.
