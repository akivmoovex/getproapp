# ActiveClinic Password Recovery

**Stage:** AC-V6-09  
**Branch:** V6

## Public routes

- `GET /forgot-password`
- `POST /forgot-password` (CSRF + rate limited)
- `GET /reset-password/:token`
- `POST /reset-password/:token` (CSRF)

## Public request behaviour

- Accepts phone or email
- Always returns a generic message
- Does **not** reveal whether an account exists
- Does **not** return the reset link to the public caller
- Issues a hashed token only for eligible platform identities (usable identity + password present + ActiveClinic staff profile)

Token purpose: `activeclinic_password_reset`  
TTL: 1 hour  
Storage: `platform.identity_action_tokens` (hash only)

## Completion

1. Password policy enforced
2. Token consumed once
3. ActiveClinic deployment sessions for that `platform_identity_id` revoked
4. BlessBoard sessions (other deployments / `user_id` principal) remain untouched by default
5. Failed-login / temporary lock fields cleared via password update
6. Redirect to `/login?reset=1`

## Admin / testing issuance

Authorized callers with `activeclinic.staff.manage_credentials` may use:

`POST /app/staff/:staffId/send-reset`

This returns a copyable/shareable reset URL when automated delivery is unavailable (`deliveryStatus: link_generated`).

## Deferred

- Real email / SMS provider integration
- WhatsApp Business API delivery
