# ActiveClinic V6 — Identity Foundation Notes

Companion to [ACTIVECLINIC_IDENTITY_ARCHITECTURE_DECISION.md](./ACTIVECLINIC_IDENTITY_ARCHITECTURE_DECISION.md).

## Implemented (AC-V6-04)

| Artifact | Purpose |
|----------|---------|
| `platform.identities` | Product-neutral auth account |
| `platform.identity_product_profiles` | Explicit product profile links |
| `blessboard.users.platform_identity_id` | Nullable BlessBoard bridge |
| `platform.deployment_sessions.platform_identity_id` | Nullable future principal |
| `platformIdentityService` | Create / resolve |
| `identityProductProfileService` | Link / list / resolve / unlink |
| `blessBoardIdentityCompatibility` | Adapter + session principal resolve |
| `db/scripts/audit/platform_identity_link_candidates.sql` | Read-only ambiguity audit |

## Credential transition

BlessBoard `password_hash` remains canonical for BlessBoard login. Linking does not copy hashes onto `platform.identities`.

## Not in this prompt (AC-V6-04)

ActiveClinic login, staff UI, OTP providers, clinical tables, production migrate/deploy.

## Later (AC-V6-09)

Staff invitation, activation, and password recovery use `platform.identity_action_tokens` (not `blessboard.user_action_tokens`). See [ACTIVECLINIC_STAFF_INVITATION_LIFECYCLE.md](./ACTIVECLINIC_STAFF_INVITATION_LIFECYCLE.md).
