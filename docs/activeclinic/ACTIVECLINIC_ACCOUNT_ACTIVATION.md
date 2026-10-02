# ActiveClinic Account Activation

**Stage:** AC-V6-09  
**Branch:** V6

## Routes

- `GET /activate/:token`
- `POST /activate/:token` (CSRF protected)

## Flow

1. Recipient opens deployment-relative activation URL (`{publicOrigin}/activate/<token>`).
2. Preview shows ActiveClinic branding, HCO public name, staff display name, and invitation purpose only.
3. Recipient sets password (min 10 chars) with confirmation.
4. Token is revalidated and consumed transactionally.
5. Password hash is stored on `platform.identities`; lock/failure counters reset; `credentials_updated_at` updated.
6. Invitation marked `accepted`.
7. Staff status moves `invited` → `active` **only** when at least one non-expired active role assignment exists.
8. Redirect to `/login?activated=1` (no session created from the activation token — avoids session fixation).

## Safe failure states

Expired, revoked, consumed, and invalid tokens show a generic safe message without leaking organization or role internals.

## Non-goals

- Auto-login after activation
- SMS OTP
- Final Stitch visual parity
