# Database implementation status

Last updated: 2026-07-18

## Phase: V5 deployment-scoped sessions + apex auth — complete (code)

| Item | Status |
|------|--------|
| `platform.deployment_sessions` | Done (`platform/010` + `blessboard/006` FKs) |
| `blessboard.users` / `user_roles` | Done (`004`, `005`) |
| Apex login / logout / account | Done on V5 foundation server |
| V5 session cookie (hashed token) | Done — not `connect-pg-simple` / not `public.session` |
| User + role provisioning CLIs | Done |
| Authoritative tenant routing | Not started |
| Tenant portals / member roles | Not started |
| Password reset / email verification | Not started |

## Architecture commitments (current)

- V5 sessions are **deployment-scoped** (`PLATFORM_DEPLOYMENT_CODE`).
- Raw session tokens are **never** stored (SHA-256 hash only).
- V5 does **not** use `connect-pg-simple` or `public.session`.
- Apex-only auth (`blessboard.org` / `www`); tenant `/login` remains unavailable.
- Platform hostname + BlessBoard catalogue remain **diagnostic**.
- V4 remains on `server.legacy.js` unchanged.

## Hosted operator commands

```bash
export DATABASE_URL='postgresql://…'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
export DATABASE_IDENTITY_ENV='testing'

npm run db:migrate
npm run db:status
npm run db:identity:check
npm run db:verify:foundation

printf '%s' 'TEMP_PASSWORD' | npm run blessboard:user:create -- \
  --email admin@example.org --display-name 'Administrator' --password-stdin

npm run blessboard:user:role:assign -- \
  --email admin@example.org \
  --organization-key example-church \
  --role church_hq_admin \
  --church-key example-church
```

## Remaining blockers

1. Hosted migrate + first admin user still operator-run.
2. Tenant portals and authoritative routing not started.
3. Legacy request context usually lacks platform UUIDs.

## Exact next phase recommendation

After hosted login works on apex: wire authenticated apex navigation only, then plan tenant-host cutover behind an explicit flag — still without `public.session` / `public.tenants`.
