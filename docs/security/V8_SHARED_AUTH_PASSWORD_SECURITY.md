# V8 Shared Authentication & Password Security

**Branch:** `V8`  
**Stitch:** `projects/2734098283637220752` (V8 Shared Security & Onboarding) — project exists; screens not yet generated (Prompt 00 incomplete). Existing BB/AC auth screens retained; invite accept gained password confirmation.

## What changed

- Centralized policy: `src/platform/auth/sharedPasswordPolicy.js`
  - Default min **10** / max **200** (V7-compatible)
  - Optional raise via `GETPRO_PASSWORD_MIN_LENGTH` / `GETPRO_PASSWORD_MAX_LENGTH` (floor never below 10)
  - Shared `validatePasswordPolicy` + `validatePasswordPair` for registration, reset, invitations, activation, password change
- Wired BB + AC callers to the shared module (no product-specific length forks)
- Recovery tokens remain hashed, TTL 1h, single-use; concurrent tokens revoked on successful reset
- Sessions revoked after successful password reset/change (existing behavior preserved + AC sibling-token revoke)
- Public recovery responses stay enumeration-safe (neutral message)
- Phone-first identity + optional email unchanged; registration reuse via `resolveRegistrationContactIdentity`
- **No DB migration** — additive schema not required; bcrypt hashes unchanged

## Tests

```bash
node --test --test-concurrency=1 tests/v8-shared-auth-password-security.test.js
npm run test:v8:regression
```

Covered: policy bounds, confirmation mismatch, bcrypt compat, registration identity reuse, BB recovery enumeration/expiry/reuse/sessions, AC reset reuse + concurrent revoke + cross-product token isolation.
