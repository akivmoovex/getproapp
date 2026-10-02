# ActiveClinic Staff Invitation Lifecycle

**Stage:** AC-V6-09  
**Status:** Foundational complete  
**Branch:** V6

## Purpose

Governed staff invitation flow for ActiveClinic:

administrator → staff profile → identity resolve/create → product-profile link → facility/role assignment → activation token → password creation → active account (when roles permit)

## Identity matching

Deterministic order:

1. Explicit `platform_identity_id` from an authorized selector
2. Unique **verified** normalized phone
3. Unique **verified** normalized email
4. Otherwise create a new `platform.identities` row **without** a password

Never auto-link on name, display name, job title, or unverified contact. Ambiguous verified matches return `ambiguous_identity_match`, emit an audit event, and require administrator resolution.

Phone is required for Zambian staff profiles (schema + contact normalization). Email is optional.

## Invitation statuses

`draft` | `pending` | `accepted` | `expired` | `revoked`

Tokens are stored only as SHA-256 hashes in `platform.identity_action_tokens` (purpose `activeclinic_staff_activation`). Raw tokens are returned only to authorized service callers and never logged.

## Token binding

- Platform identity
- Staff member
- Organization
- Deployment code
- Product `activeclinic`
- Purpose
- Expiry (72 hours)
- One-time redemption
- Revocable; reissue invalidates prior active activation tokens for the same staff+identity

## Permissions

- `activeclinic.staff.invite` — issue / reissue / revoke invitations (network admin + facility admin)
- `activeclinic.staff.assign_access` — assign roles during invite
- `activeclinic.staff.create` / `update` — profile fields

Facility admins do **not** receive `activeclinic.staff.manage_credentials` by default.

## Delivery

Without email/SMS providers:

- Delivery status `link_generated` or `unavailable`
- Authorized admins receive copyable activation URL
- WhatsApp = `wa.me` share URL only (no Business API)
- Mailto share when email exists

## Known limitations

- No automated email/SMS delivery
- Minimal admin UI (not final Staff screen)
- No Stitch parity in this stage

## Related docs

- [ACTIVECLINIC_ACCOUNT_ACTIVATION.md](./ACTIVECLINIC_ACCOUNT_ACTIVATION.md)
- [ACTIVECLINIC_PASSWORD_RECOVERY.md](./ACTIVECLINIC_PASSWORD_RECOVERY.md)
- [ACTIVECLINIC_ACCOUNT_ADMINISTRATION.md](./ACTIVECLINIC_ACCOUNT_ADMINISTRATION.md)
