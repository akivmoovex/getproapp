# V8 PROMPT 04 — Shared phone identity fix

**Branch:** `V8` only  
**Verdict:** `V8_SHARED_PHONE_IDENTITY_CODE_PASS`  
**Date:** 2026-09-21  
**Hosts:** Code + local automated tests only (no deploy / no migration apply)

## Problem

Clinic registration and staff invitation could mint a second `platform.identities` row for a phone that already belonged to another principal when the existing row was unverified, or under concurrent creates. That allowed a different identity to claim a staff member’s phone. Implicit merge/transfer and “suspend then reuse” were never acceptable.

## Rules enforced (ActiveClinic + BlessBoard)

Shared helpers in `src/platform/registration/resolveRegistrationContactIdentity.js`:

| Rule | Behavior |
|------|----------|
| One normalized phone → one login principal | Match/create paths reject or reuse; never mint a second principal for the same E.164 |
| Additional organization | Password-verified (or explicit admin ack) reuse attaches membership only |
| No implicit merge/transfer | Collision returns existing principal id; passwords are never overwritten |
| Suspended / disabled | Reject registration reuse; do not require suspension to free a phone |
| Concurrent create | Transaction advisory locks serialize same-contact creates (pool-safe) |

BlessBoard continues to use `blessboard.users` with the same match/authorize helpers; ActiveClinic uses `platform.identities`.

## Code changes

1. **`createPlatformIdentity`** — `pg_advisory_xact_lock` on normalized phone/email keys inside a single connection/transaction (Pool: short owned txn; Client already in txn: lock on that txn). Pre-insert lookup by any normalized contact; unique-index collisions mapped to duplicate codes.
2. **`resolveOrCreateInvitationIdentity`** — Match **any** normalized phone/email (not verified-only). On create collision with an existing usable identity, **link** instead of `CONFLICT`.
3. **Tests** — Invitation unverified-phone link; concurrent `createPlatformIdentity`; lifecycle mock updated to `findIdentitiesByNormalizedContact`.

Registration administrator paths (AC/BB) already used shared password-gated reuse and suspended rejection; clinic approve path already `FOR UPDATE` + verified phone on create.

## Tests run

- `tests/v7-shared-phone-identity.test.js` (formats, multi-org reuse, conflict, concurrent registration, suspended, invitation, concurrent create, AC login)
- `tests/blessboard-registration-identity-idempotency.test.js`
- `tests/blessboard-phone-login.test.js`
- `tests/activeclinic-account-lifecycle.test.js` (invitation ambiguous match)
- Broader ActiveClinic / phone regression cluster as available

## Non-goals / deferred

- Applying a DB unique index on all (including unverified) `phone_normalized` values — overnight rule forbids migration apply; advisory locks + application checks cover the race.
- Hosted write verification (registration POST on neuniversity) — overnight rule 10.

## Preserve V7

No V7 branch changes. Shared services remain backward-compatible for existing verified V7 identities and multi-org memberships.
