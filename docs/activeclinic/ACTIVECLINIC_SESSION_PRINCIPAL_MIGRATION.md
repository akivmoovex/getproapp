# ActiveClinic V6 — Session Principal Migration (AC-V6-07)

**Status:** Implemented (transitional)  
**Branch:** `V6`  
**Verdict target:** `ACTIVECLINIC_V6_SESSION_PRINCIPAL_COMPLETE`

## 1. Legacy model

- `platform.deployment_sessions.user_id` → `blessboard.users(id)` (nullable FK)
- Session create/read assumed a BlessBoard user row (`INNER JOIN blessboard.users`)
- `platform_identity_id` existed (AC-V6-04) but writers did not set it
- Cookies remain deployment-scoped (`blessboard_org_sid` / `activeclinic_org_sid`)

## 2. Transitional principal model

| State | `user_id` | `platform_identity_id` | Principal type |
|-------|-----------|------------------------|----------------|
| BlessBoard legacy | set | null | `blessboard_user` |
| Linked BlessBoard | set | set (must match `users.platform_identity_id`) | `linked` |
| ActiveClinic | null | set | `platform_identity` |
| Invalid empty | null | null | rejected (DB CHECK + resolver) |
| Invalid conflict | set | set but not linked | rejected (resolver / writer) |

Exactly one canonical path is used after resolution. Dual columns are allowed only when they refer to the same linked human.

## 3. Database

Migration: `db/migrations/platform/022_session_auth_transfer_principals.sql`

- CHECK `deployment_sessions_principal_present`: at least one principal
- Index `(deployment_code, platform_identity_id)` for active identity sessions
- No backfill; no rewrite of historical rows
- Conflict validation is service-level (linked pair must match)

## 4. Resolver

`src/platform/session/resolveDeploymentSessionPrincipal.js`

Steps:

1. Reject missing principal
2. Reject expected vs deployment product mismatch
3. Dual refs → load BlessBoard user + identity; require link match; require usable identity when configured
4. User-only → BlessBoard product only; optional linked identity metadata
5. Identity-only → ActiveClinic deployment/product only; no `blessboard.users` required

Compatibility adapter: `blessBoardIdentityCompatibility.resolveSessionPrincipal` delegates here.

## 5. Writers

`src/platform/session/createDeploymentSession.js`

- `createBlessBoardSession` / `createV5Session` — legacy + optional linked dual-write
- `createPlatformIdentitySession` — ActiveClinic only; rejects BlessBoard-only input
- Conflicting dual input rejected; disabled identities rejected
- Cookie namespace unchanged (deployment profile)

## 6. Readers

`readV5Session` uses `LEFT JOIN blessboard.users` and resolves principal before returning. BlessBoard response still exposes `session.user` when `user_id` is present. ActiveClinic sessions expose `platformIdentity` / `principalType` with `user: null`.

## 7. Revocation

`revokeV5Session.js`:

- by raw token + deployment
- by BlessBoard user + deployment
- by platform identity + deployment (default)
- global identity revoke only with `allowGlobal: true` (privileged)

Revoking ActiveClinic sessions does not revoke BlessBoard sessions unless explicitly requested.

Auth status (session) remains separate from staff authorization (AC-V6-06).

## 8. Product / cookie isolation

- ActiveClinic identity sessions only on `application_code = activeclinic`
- BlessBoard user sessions only on BlessBoard deployments
- Cookie names stay deployment-specific; no cross-domain SSO

## 9. Compatibility period

- Existing BlessBoard login/logout/session/CSRF/password-reset paths unchanged in behavior
- Dual-write of `platform_identity_id` on every BlessBoard login is **not** enabled yet
- Future dual-write when deterministic linking is available and tested

## 10. Future cutover criteria

- Dual-write stable for linked BlessBoard users
- AC login credential path on `platform.identities`
- Session readers/gates product-aware end-to-end
- Optional later retirement of BlessBoard-only session rows for dual-product humans

## 11. Rollback

1. Stop calling `createPlatformIdentitySession`
2. Drop CHECK / new indexes if needed (additive reverse)
3. BlessBoard legacy sessions unaffected

## 12. Known risks

| Risk | Mitigation |
|------|------------|
| Ambiguous dual principals | Resolver + writer reject |
| Accidental cross-product session | Product checks on write and read |
| Premature dual-write | Not enabled |
| Staff suspended but session alive | Authz separate (AC-V6-06); identity suspend denies session read |

## 13. Gate for ActiveClinic login (AC-V6-08)

- Sessions can exist without `blessboard.users`
- **AC-V6-08:** ActiveClinic login, logout, org selection, password-change-required, and `/app` entry are implemented
- Invitation / OTP / password-reset delivery remain later stages
- Auth-transfer AC path used for multi-org selection
