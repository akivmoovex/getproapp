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
