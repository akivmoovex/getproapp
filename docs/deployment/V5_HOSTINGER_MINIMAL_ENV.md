# BlessBoard.org V5 — Hostinger staged env cleanup

**Date:** 2026-08-01  
**Do not deploy from this doc alone.** Deploy code first, then remove panel variables in stages.

## Final permanent panel list

```bash
NODE_ENV=production
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
DATABASE_URL=<testing database URL>
SESSION_SECRET=<unique testing secret>
# Optional:
# GETPRO_PG_SSL=no-verify
```

## Stage A — code + compatibility

1. Deploy the build that includes `src/platform/config/deploymentProfiles.js`.
2. Keep existing Hostinger variables.
3. Confirm startup logs: V5 foundation ACTIVE; deprecation warnings for matching duplicates.
4. Confirm `GET /healthz` → `{"ok":true,"mode":"v5-foundation",...}`.
5. Confirm www → apex stays on blessboard.org; no redirect to blessboard.com.

## Stage B — remove duplicates (one group per restart)

1. Domain duplicates: `BLESSBOARD_CANONICAL_DOMAIN`, `BLESSBOARD_APEX_DOMAINS`, `BLESSBOARD_PUBLIC_URL`, `BLESSBOARD_ADMIN_URL`, `CHURCH_HOST_DOMAIN`, bare `PUBLIC_URL` / `CANONICAL_DOMAIN` / `PUBLIC_SCHEMA`
2. Session / jobs / host defaults: `SESSION_COOKIE_NAME`, `BLESSBOARD_JOBS_ENABLED`, `TRUST_PROXY`, `HOST`, `PLATFORM_HOST_CONTEXT_MODE`
3. Deployment aliases: `DEPLOYMENT_ENV`, `EXPECTED_DATABASE_ENV`, `BASE_DOMAIN`
4. CLI-only leftovers: `DATABASE_IDENTITY_EXPECTED`, `BLESSBOARD_INITIALIZE_DB_IDENTITY`, `BLESSBOARD_ALLOW_TEST_USERS*`
5. `ADMIN_PASSWORD` (V5 foundation does not use it)

## Stage C — later code cleanup

Remove deprecated compatibility readers in a separate PR after one successful Hostinger cycle.

## Never remove

- `DATABASE_URL`
- `SESSION_SECRET`
- `PLATFORM_DEPLOYMENT_CODE`
- `NODE_ENV` (keep `production` on Hostinger)
