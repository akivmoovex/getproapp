# Database implementation status

Last updated: 2026-07-18

## Phase: BlessBoard churches + branches catalogue — complete (code)

| Item | Status |
|------|--------|
| Platform foundation migrations + seeds | Done |
| SSL-aware foundation admin pool (Supabase-safe) | Done |
| `npm run db:bootstrap:foundation` (manual) | Done — applies all approved migrations including BlessBoard catalogue |
| `npm run db:verify:foundation` (read-only allowlist) | Done — `blessboard.churches` / `branches` approved; getpro/ngo empty |
| `identity_key` / `DATABASE_IDENTITY_EXPECTED` | Done (`platform/009`) |
| Hosted Supabase runbook | Done |
| V5 foundation HTTP startup | Done |
| BlessBoard `churches` + `branches` migrations | Done (`blessboard/002`, `003`) |
| BlessBoard church provisioning CLI/service | Done |
| Read-only catalogue lookup (not Express-wired) | Done |
| Authoritative platform routing | Not started |
| V5 auth/sessions/portals | Not started |

## Architecture commitments (current)

- **V4** → old/legacy database only.
- **V5** → new platform database only (`DATABASE_URL`). No `GETPRO_DATABASE_URL`. No `public.tenants` / `public.session`.
- Migrations **never** run at application startup.
- Hosted init is **human-run** only (`db:bootstrap:foundation` or `db:migrate`).
- `db:migrate` / bootstrap apply **all approved** module migrations; foundation verification uses an **approved-table allowlist** (Approach B).
- Platform hostname routing remains diagnostic / non-authoritative.
- `platform.organizations` is shared tenant identity; `blessboard.churches.organization_id` is the permanent UUID bridge; branches are product-owned.

## Hosted operator commands

```bash
export DATABASE_URL='postgresql://…'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
export DATABASE_IDENTITY_ENV='testing'

npm run db:migrate
npm run db:status
npm run db:identity:check
npm run db:verify:foundation
```

Then provision a platform tenant, then its BlessBoard church (no auto demo):

```bash
npm run platform:tenant:provision -- …
npm run blessboard:church:provision -- …
```

See `docs/database/HOSTED_SUPABASE_RUNBOOK.md`.

## Verification (2026-07-18, local)

- `npm run test:db:bootstrap-foundation` → **9 pass**
- `npm run test:db:foundation` → **16 pass**
- `npm run test:blessboard:catalogue` → **12 pass**
- `npm run test:blessboard:provisioning` → **12 pass**
- `npm run test:v5:foundation-startup` → **11 pass**
- `npm run test:platform:resolution` → **25 pass**
- `npm run test:platform:provisioning` → **19 pass**
- `npm run test:platform:diagnostic-integration` → **1 pass**
- `npm run test:platform:http-context` → **22 pass**
- `npm run test:platform:host-comparison` → **24 pass**

## Remaining blockers

1. Operator must run migrate/verify against the real hosted Supabase URL (not done from Cursor).
2. V5 auth/sessions/tenant portals not migrated.
3. Platform resolution still non-authoritative.
4. Catalogue lookup not wired into Express.

## Exact next phase recommendation

After hosted migrate + `db:verify:foundation` and a first real church provision: add deployment-scoped session storage + minimal apex auth on V5 — still without `public.tenants` / `public.session`, and without authoritative hostname cutover.
