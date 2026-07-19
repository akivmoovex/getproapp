# BATCH_FG_HQ_ROLE_MANAGEMENT — BB-02 shipped

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **SHIPPED**  
**Priority class:** OPTIONAL GROWTH (retained as BB-02)

## Gate

| Check | Result |
|-------|--------|
| HQ roles retained? | **Yes** — BB-02 OPTIONAL GROWTH in [`FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md) |
| New global roles? | **No** — only existing `church_hq_admin` / `branch_admin` |
| Schema / migration? | **None** — existing `blessboard.user_roles` |

## Routes

| Method | Path | Actor |
|--------|------|--------|
| GET | `/hq/roles` | `church_hq_admin`, `platform_admin` |
| POST | `/hq/roles/assign` | same + CSRF + confirm |
| POST | `/hq/roles/:roleId/revoke` | same + CSRF + confirm |

## Role access

| Action | Allowed |
|--------|---------|
| Assign `church_hq_admin` | HQ / platform admin, same church only |
| Assign `branch_admin` | HQ / platform admin, branch required, same church |
| Assign `platform_admin` | **Forbidden** via this UI/service |
| Self assign/revoke | **Forbidden** |
| Cross-church | **Forbidden** |
| Inactive user | **Forbidden** |

## Entitlement

Soft seat check via `evaluateStaffAccountLimit` / `max_staff_accounts` on new staff accounts (same as CLI assign).

## Stitch

| Viewport | Title | ID |
|----------|-------|-----|
| Desktop | `59-hq-permission-role-management-desktop` | `12f5be535eeb49f1a1c5822ae7586504` |
| Mobile | `59-hq-permission-role-management-mobile` | `de3e82ef3ad54065a516b042459fdc19` |

Presentation: staff list + HQ/Branch admin cards only. **Not** copied: Ministry Leader tier, fake permission toggles, fabricated trend stats.

## Audit

- `role.assigned` / `role.revoked` on `platform.audit_events`
- Nested pool-client audit connect bug fixed in `auditEventService` / `recordBlessBoardAudit`

## Tests

`node --test --test-concurrency=1 tests/blessboard-hq-roles.test.js` — assign, reject platform/cross-church/self/inactive, revoke + stale authz, CSRF/confirm, audit, a11y markers.

## Hosted migration

**Not required** (no DDL).

## Suggested commit

```text
Add HQ fixed-role assign/revoke UI for church and branch admins.
```
