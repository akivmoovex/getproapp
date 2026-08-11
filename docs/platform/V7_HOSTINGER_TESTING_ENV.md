# V7 Hostinger testing environment variables

## Required (Hostinger testing / `moovex-platform-testing`)

| Variable | Required value | Notes |
| -------- | -------------- | ----- |
| `NODE_ENV` | `production` | **lowercase** only (`Production` is wrong) |
| `DEPLOYMENT_ENV` | `testing` | Required for platform runtime; missing fails startup |
| `PLATFORM_DEPLOYMENT_CODE` | `moovex-platform-testing` | Selects hostname product resolution |
| `DATABASE_URL` | testing connection string | Must resolve DNS; never commit |
| `DATABASE_IDENTITY_EXPECTED` | `moovex-platform-v7` | Required for platform runtime |
| `DATABASE_IDENTITY_ENV` | `testing` | Required for platform runtime |
| `SESSION_SECRET` | long random secret | Required |

## Testing database identity

Hostinger testing DB singleton:

```text
identity_key=moovex-platform-v7
environment_code=testing
```

Local ops: copy `scripts/local/env.testing.local.example` → `.env.testing.local` and set
`DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`.

Re-check:

```bash
npm run db:identity:check:testing
```

If a testing DB still reports `blessboard-platform-v5`, run the guarded migrator:

```bash
npm run db:identity:migrate-testing-to-moovex-v7 -- \
  --confirm migrate-testing-identity-to-moovex-platform-v7
```

Never run that migrator against production.

## Compatibility / optional

| Variable | Role |
| -------- | ---- |
| `GETPRO_PG_SSL` | Optional SSL for Postgres |
| `PORT` | Optional listen port |
| `BASE_DOMAIN` | Compatibility only; must not conflict with profile if set |
| `DBURL_TEST` | Diagnostic presence probe only; not used as DB URL |
| `SESSION_COOKIE_NAME` | Compatibility; must match profile if set (prefer omit) |
| `EXPECTED_DATABASE_ENV` | Compatibility alias of testing/production; must match if set |
| `BLESSBOARD_*` domain/URL vars | Compatibility; must match profile if set |
| `GETPRO_DATABASE_URL` | **Dangerous** on V7 foundation — unused / must stay unset |
| `CSRF_SECRET` | **Obsolete** in this codebase (not consumed) |

## Dangerous if wrong

| Variable | Risk |
| -------- | ---- |
| Unset `PLATFORM_DEPLOYMENT_CODE` | Legacy path → `getpro_sid`, `blessboard.com`, production-like fallbacks |
| Unset `DEPLOYMENT_ENV` with platform code | Startup **refuses** (fixed) |
| `DATABASE_URL` with bad hostname | `getaddrinfo ENOTFOUND` — replace with working testing Supabase URL |
| `GETPRO_DATABASE_URL` | Can confuse ops; V5/V7 foundation disables fallback |

## DATABASE_URL ENOTFOUND

If logs show `getaddrinfo ENOTFOUND db.exoelhlxvstevtwbldyc.supabase.co`, Hostinger’s `DATABASE_URL` host is wrong or unreachable. Obtain the current connection string from the **intended testing** Supabase project and replace Hostinger `DATABASE_URL`. Do not invent URLs in git.

`GETPRO_PG_SSL=no-verify` does **not** cause `ENOTFOUND` — that error is DNS resolution, before TCP/TLS.

## Environment loading precedence (application)

Order for `NODE_ENV=production` (Hostinger):

1. **Hostinger-injected `process.env`** (and any supervisor-inherited env) — wins for every key already set
2. **Early** `/home/u549637099/pronline/.env.production` (or other candidate) via dotenv `override: false` — fills **missing** keys only
3. Repo `.env` — **skipped** in production
4. Secondary production-file rescue — skipped when DB URL + `SESSION_SECRET` + `BASE_DOMAIN` already present (`mergeSkipped=yes`); does not undo early load

`DATABASE_URL` effective value: host-injected if present before file merge; else filled from `.env.production` if missing; pool prefers `DATABASE_URL` over `GETPRO_DATABASE_URL`.

`DBURL_TEST` is **not** used as a connection string. Presence often comes from `.env.production` early fill even when absent from hPanel.

## Stale worker diagnosis

If hPanel shows new V7 vars / new Supabase hostname but worker logs show old hostname + `dbUrlSource=host-injected` + unset `PLATFORM_DEPLOYMENT_CODE`:

- Application bootstrap does **not** overwrite Hostinger keys
- The running Node process still has the **old** injected `DATABASE_URL`
- New hPanel values have not reached that worker — restart/rebuild the Node app so workers inherit the updated panel env

Safe checks after redeploy:

- Grep logs for `processMarker` / `dbUrlFingerprint phase=pre_file`
- Testing-only: `GET /__platform/runtime` on `pronline.org` (blocked when `DEPLOYMENT_ENV=production`)

