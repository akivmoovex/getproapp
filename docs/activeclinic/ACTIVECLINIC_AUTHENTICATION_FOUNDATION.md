# ActiveClinic V6 — Authentication Foundation (AC-V6-08)

**Status:** Implemented  
**Branch:** `V6`  
**Verdict target:** `ACTIVECLINIC_V6_AUTH_FOUNDATION_COMPLETE`

## Credential ownership

ActiveClinic passwords live on **`platform.identities`** (`password_hash`, `must_change_password`, lockout fields). They are never stored on `activeclinic.staff_members` or `blessboard.users`.

BlessBoard passwords remain on `blessboard.users`. No automatic hash copy.

## Transitional dual-product behavior

| Identity | BlessBoard login | ActiveClinic login |
|----------|------------------|--------------------|
| AC-only with platform password | N/A | Platform credential |
| Dual-product linked | BlessBoard hash | Platform hash (may differ) |
| Staff without identity | N/A | Cannot sign in |
| Identity without platform password | Unchanged if BB user | Generic failure |

## Login

- Identifiers: phone (preferred, Zambia-friendly normalization) or email
- Routes: `GET/POST /login`, optional org selection, `POST /logout`, `GET /app`
- Session: `platform_identity` principal, cookie `activeclinic_org_sid`
- CSRF: `activeclinic_org_csrf`

## Eligibility

See `ACTIVECLINIC_LOGIN_ELIGIBILITY.md`.

## Password change

`GET/POST /account/change-password` when `must_change_password` is true. Revokes other ActiveClinic sessions in the deployment; BlessBoard sessions untouched by default.

## Deferred

OTP, WhatsApp Business API / SMS provider delivery, automated email delivery, final Staff UI / Stitch parity, clinical modules.

## Account lifecycle (AC-V6-09)

Staff invitations, activation, and password recovery are implemented. See:

- [ACTIVECLINIC_STAFF_INVITATION_LIFECYCLE.md](./ACTIVECLINIC_STAFF_INVITATION_LIFECYCLE.md)
- [ACTIVECLINIC_ACCOUNT_ACTIVATION.md](./ACTIVECLINIC_ACCOUNT_ACTIVATION.md)
- [ACTIVECLINIC_PASSWORD_RECOVERY.md](./ACTIVECLINIC_PASSWORD_RECOVERY.md)
- [ACTIVECLINIC_ACCOUNT_ADMINISTRATION.md](./ACTIVECLINIC_ACCOUNT_ADMINISTRATION.md)

## Gate for AC-V6-09

Invitation / password activation / recovery may begin.
