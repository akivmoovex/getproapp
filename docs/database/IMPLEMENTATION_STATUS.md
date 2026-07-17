# Database implementation status

Last updated: 2026-07-18

## Phase: hosted foundation bootstrap + verify — complete

| Item | Status |
|------|--------|
| Platform foundation migrations + seeds | Done |
| SSL-aware foundation admin pool (Supabase-safe) | Done |
| `npm run db:bootstrap:foundation` (manual) | Done |
| `npm run db:verify:foundation` (read-only) | Done |
| `identity_key` / `DATABASE_IDENTITY_EXPECTED` | Done (`platform/009`) |
| Hosted Supabase runbook | Done |
| V5 foundation HTTP startup | Done (prior) |
| Authoritative platform routing | Not started |
| BlessBoard product tables on new DB | Not started |
| V5 auth/sessions/portals | Not started |

## Architecture commitments (current)

- **V4** → old/legacy database only.
- **V5** → new platform database only (`DATABASE_URL`). No `GETPRO_DATABASE_URL`. No `public.tenants` / `public.session`.
- Migrations **never** run at application startup.
- Hosted init is **human-run** only (`db:bootstrap:foundation`).
- Platform hostname routing remains diagnostic / non-authoritative.

## Hosted operator commands

```bash
export DATABASE_URL='postgresql://…'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'

npm run db:bootstrap:foundation
npm run db:status
npm run db:identity:check
npm run db:verify:foundation
```

See `docs/database/HOSTED_SUPABASE_RUNBOOK.md`.

## Verification (2026-07-18, local audit)

- `npm run test:db:bootstrap-foundation` → **9 pass**
- `npm run test:db:foundation` → **16 pass**
- `npm run test:v5:foundation-startup` → **11 pass**
- `npm run test:platform:resolution` → **25 pass**
- `npm run test:platform:http-context` → **22 pass**
- `npm run test:platform:host-comparison` → **24 pass**
- `npm run test:platform:provisioning` → **19 pass**
- `npm run test:platform:diagnostic-integration` → **1 pass**
- `npm test` discovery fixed to `tests/**/*.test.js` (was broken module path `tests`)

## Remaining blockers

1. Operator must run bootstrap against the real hosted Supabase URL (not done from Cursor).
2. V5 auth/sessions/tenant portals not migrated.
3. Platform resolution still non-authoritative.
4. No BlessBoard product tables on the new database yet.

## Exact next phase recommendation

After hosted `db:verify:foundation` passes: wire V5 Hostinger `DATABASE_URL` to the initialized project (foundation mode already boots), then migrate a deployment-scoped session + minimal apex auth — still without `public.tenants` / `public.session`.
