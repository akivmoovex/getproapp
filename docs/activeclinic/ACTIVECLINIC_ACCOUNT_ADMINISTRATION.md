# ActiveClinic Account Administration

**Stage:** AC-V6-09  
**Branch:** V6

## Authenticated routes (foundation)

All require ActiveClinic session, CSRF, organization scope, and permissions:

| Route | Permission |
|-------|------------|
| `POST /app/staff/invite` | `activeclinic.staff.invite` |
| `POST /app/staff/:staffId/invitations` | `activeclinic.staff.invite` |
| `POST /app/staff/:staffId/invitations/reissue` | `activeclinic.staff.invite` |
| `POST /app/staff/:staffId/invitations/revoke` | `activeclinic.staff.invite` |
| `GET /app/staff/:staffId/invitations` | `activeclinic.staff.view` |
| `POST /app/staff/:staffId/send-reset` | `activeclinic.staff.manage_credentials` |
| `POST /app/staff/:staffId/revoke-sessions` | `activeclinic.staff.manage_credentials` |
| `POST /app/staff/:staffId/require-password-change` | `activeclinic.staff.manage_credentials` |
| `POST /app/staff/:staffId/unlock` | `activeclinic.staff.manage_credentials` |
| `POST /app/staff/:staffId/suspend` | `activeclinic.staff.archive` |
| `POST /app/staff/:staffId/restore` | `activeclinic.staff.archive` |

## Suspension vs identity

- **Staff suspension** sets `staff_members.status = suspended`, denies ActiveClinic authorization, may revoke ActiveClinic sessions, does **not** suspend the global platform identity, and does not affect BlessBoard.
- **Restore** returns staff to `active` (or `invited` if no password yet). It does **not** revive expired roles, recreate invitations, or reactivate archived facility assignments.

## Session revocation

`revokeSessionsByPlatformIdentity` is deployment-scoped (`activeclinic-org-v6` by default). BlessBoard deployment sessions remain independent.

## Sharing

Invitation/admin reset results support:

- Copy link
- Mailto when email present
- `wa.me` WhatsApp share URL when phone present
- Honest delivery status (`link_generated` / `unavailable`)

## Next-stage UI

Final Staff management screens and Stitch parity are deferred to later V6 prompts (shell / staff UI stages).
