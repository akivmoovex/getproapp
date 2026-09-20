# V8 Shared Email & Phone Verification

**Branch:** `V8`  
**Stitch:** `projects/2734098283637220752` — no screens generated yet; shared EJS partial used until approved screens exist.

## Delivery method

| Environment | Delivery |
| --- | --- |
| `NODE_ENV=test` / `DEPLOYMENT_ENV=testing` / V8 testing codes | **Testing outbox** (`verificationTestingOutbox`) — codes peekable only via `peekSharedVerificationCodeForTests` |
| Production | Provider marked `unavailable` until a verified SMS/email provider is wired; codes never logged |

Plaintext OTPs are never stored in Postgres (HMAC-SHA256 only) and never written to production logs.

## Schema (additive)

- `platform/036_identity_verification_challenges.sql` — shared challenges + rate limits
- `blessboard/108_user_email_verified_at.sql` — additive `email_verified_at` on users

Does not change V7 identity uniqueness or existing `phone_verified_at` / `email_verified_at` semantics on `platform.identities`.

## Enforcement (configurable)

`GETPRO_VERIFICATION_ENFORCEMENT=off|soft|hard`

- Default **off** on V7; **soft** when V8 deployment is detected
- **Legacy / unknown** (`*_verified_at IS NULL`): status `legacy_unverified` — **never locked out of login**
- Soft: prompts only; Hard: may gate non-login sensitive actions for explicitly unverified new flows only

## API surface

- `src/platform/verification/sharedVerificationService.js`
- BB: `src/blessboard/services/blessBoardSharedVerification.js`
- AC: `src/activeclinic/services/activeClinicSharedVerification.js`

## Tests

```bash
npm run test:v8:verification
npm run test:v8:regression
```
