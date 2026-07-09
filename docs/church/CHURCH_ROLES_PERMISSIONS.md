# GetPro Church — roles and permissions

Summary for MVP planning. **Not enforced in Phase 0–1** (public homepage only).

## Roles

| Role | Scope | MVP golden thread |
|------|-------|-------------------|
| **Public visitor** | Unauthenticated | Discover church, start registration |
| **Member** | Single branch | Login after verification, use member portal |
| **Branch admin** | Single branch | Verify members, attendance, giving summary, submit monthly report |
| **HQ admin** | Organization (all branches) | Review and approve/return monthly reports |
| **Ministry leader** | Assigned ministry | Deferred — screens 46–50 |
| **Platform admin** | `church.getproapp.org` | Create organizations, manage branch tenants |

## Permission boundaries (target)

| Capability | Member | Branch admin | HQ admin | Platform admin |
|------------|--------|--------------|----------|----------------|
| View public website | Yes | Yes | Yes | Yes |
| Register (self) | Yes | — | — | — |
| Verify members | — | Yes | — | — |
| Record attendance | — | Yes | — | — |
| Edit giving summary | — | Yes | — | — |
| Submit monthly report | — | Yes | — | — |
| Review monthly report | — | — | Yes | — |
| Create church organization | — | — | — | Yes |

## Session models (planned)

Follow existing GetPro portal patterns:

- Members: separate session from admin / company portal (like `clientPortal`)
- Branch admins / HQ admins: church-scoped auth modules under `src/church/` (Phase 2+)

## Phase 0–1 status

No authentication or RBAC middleware is active yet. Register / Member Login buttons on the public homepage are placeholders (`#register`, `#member-login`).
