# Database implementation status

Last updated: 2026-07-17

## Phase: V5 foundation startup mode — complete

| Item | Status |
|------|--------|
| Platform foundation + resolver + host diagnostics | Done |
| `provisionPlatformTenant` transactional service | Done |
| V5 foundation HTTP startup (`PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` + `DEPLOYMENT_ENV=testing`) | Done |
| V4 remains on legacy DB / `server.legacy.js` unchanged behavior | Done |
| Startup / authoritative routing cutover | Not started (diagnostics only) |
| BlessBoard product / church tables on new DB | Not started |
| V5 auth, sessions, tenant portals | Not started |
| Hosted Supabase | Not started (by design) |

## Architecture commitments (current)

- **V4** → old/legacy database only.
- **V5** → new platform database only (`DATABASE_URL`). No `GETPRO_DATABASE_URL`. No `public.tenants` / `public.session` / legacy app tables.
- Legacy `public` tables are **intentionally absent** from the new database.
- V5 foundation mode is **temporary**.
- Platform hostname routing remains **diagnostic / non-authoritative**.
- Authentication, tenant routing, sessions, and portals are **not yet migrated** to V5.

## Commands

```bash
DATABASE_URL=postgres://… npm run db:migrate
DATABASE_URL=postgres://… npm run db:identity:init -- --env testing --confirm
DATABASE_URL=postgres://… npm run platform:tenant:provision -- \
  --organization-key demo-church \
  --display-name "Demo Church" \
  --environment testing \
  --product blessboard \
  --tenant-key demo-church \
  --hostname demo.blessboard.test \
  --domain-type canonical \
  --deployment blessboard-org-v5

# V5 Hostinger (foundation): PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5 DEPLOYMENT_ENV=testing
# BLESSBOARD_JOBS_ENABLED=0 DATABASE_URL=<new platform db>

npm run test:db:foundation
npm run test:platform:resolution
npm run test:platform:http-context
npm run test:platform:host-comparison
npm run test:platform:provisioning
npm run test:platform:diagnostic-integration
npm run test:v5:foundation-startup
```

## Verification (2026-07-17, local)

- `npm run test:db:foundation` → **16 pass**
- `npm run test:platform:resolution` → **25 pass**
- `npm run test:platform:http-context` → **22 pass**
- `npm run test:platform:host-comparison` → **24 pass**
- `npm run test:platform:provisioning` → **19 pass**
- `npm run test:platform:diagnostic-integration` → **1 pass**
- `npm run test:v5:foundation-startup` → **11 pass**
- `tests/tenant-host-routing.test.js` → **20 pass**
- `tests/church-blessboard-org-canonical-redirect.test.js` → **15 pass** (updated for `server.legacy.js`)

## Remaining blockers

1. Hosted Supabase not connected.
2. V5 auth/sessions/tenant portals not migrated (foundation 503s).
3. Platform resolution still non-authoritative.
4. No BlessBoard product tables on the new database yet.
5. Legacy request context lacks platform organization UUID (slug/key comparison only).

## Exact next phase recommendation

Migrate a minimal V5 session + BlessBoard apex auth path onto the new database (deployment-scoped session store under a product/platform schema — **not** `public.session`), still without copying legacy `public.tenants`, and keep platform hostname resolution diagnostic until product tables and org bridge exist.
