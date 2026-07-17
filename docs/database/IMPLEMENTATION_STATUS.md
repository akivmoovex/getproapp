# Database implementation status

Last updated: 2026-07-17

## Phase: transactional platform tenant provisioning + diagnostic integration — complete

| Item | Status |
|------|--------|
| Platform foundation + resolver + host diagnostics | Done |
| `provisionPlatformTenant` transactional service | Done |
| `npm run platform:tenant:provision` CLI | Done |
| Ephemeral provisioning + diagnostic integration tests | Done |
| Startup / authoritative routing cutover | Not started |
| BlessBoard product / church tables | Not started |
| Hosted Supabase | Not started (by design) |

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

npm run test:db:foundation
npm run test:platform:resolution
npm run test:platform:http-context
npm run test:platform:host-comparison
npm run test:platform:provisioning
npm run test:platform:diagnostic-integration
```

## Verification (2026-07-17, local)

- `npm run test:db:foundation` → **16 pass**
- `npm run test:platform:resolution` → **25 pass**
- `npm run test:platform:http-context` → **22 pass**
- `npm run test:platform:host-comparison` → **24 pass**
- `npm run test:platform:provisioning` → **19 pass**
- `npm run test:platform:diagnostic-integration` → **1 pass**
- Legacy host routing → **22 pass**

## Remaining blockers

1. Hosted Supabase not connected.
2. Runtime still on legacy `public` / `ensure*Schema`.
3. Platform resolution still non-authoritative.
4. Legacy request context lacks platform organization UUID (slug/key comparison only).
5. No BlessBoard product tables / church record bridge yet.

## Exact next phase recommendation

Add an optional, read-only **legacy→platform key bridge helper** (slug → `platform.organizations.id`) used only by diagnostic comparison — still no routing cutover — then promote comparison from slug/key to UUID when both sides are present.
