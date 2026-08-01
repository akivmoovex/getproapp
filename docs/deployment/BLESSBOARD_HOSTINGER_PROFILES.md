# BlessBoard Hostinger deployment profiles

**Status:** profile-aware configuration for both official Hostinger apps

**Do not deploy from this document alone.** Deploy profile-aware code first, then clean up panel variables.

## Identical keys — both applications

Variable **names** are identical on production and staging. Only **values** differ.

| Key | Production (`blessboard.com`) | Staging (`blessboard.org`) |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` |
| `PLATFORM_DEPLOYMENT_CODE` | `blessboard-com-production` | `blessboard-org-staging` |
| `DATABASE_URL` | production database URL | testing database URL |
| `SESSION_SECRET` | unique production secret | different staging secret |
| `GETPRO_PG_SSL` | `no-verify` (optional) | `no-verify` (optional) |

### Production panel template

```bash
NODE_ENV=production
PLATFORM_DEPLOYMENT_CODE=blessboard-com-production
DATABASE_URL=<production database URL>
SESSION_SECRET=<unique production secret>
GETPRO_PG_SSL=no-verify
```

### Staging panel template

```bash
NODE_ENV=production
PLATFORM_DEPLOYMENT_CODE=blessboard-org-staging
DATABASE_URL=<testing database URL>
SESSION_SECRET=<different staging secret>
GETPRO_PG_SSL=no-verify
```

## Rules

- Variable **names** are identical across both Hostinger apps.
- `DATABASE_URL` **values** must differ (production vs testing databases).
- `SESSION_SECRET` **values** must differ.
- `PLATFORM_DEPLOYMENT_CODE` **values** differ and select the deployment profile.
- No other permanent Hostinger variables are required once profile-aware code is live.
- Old duplicate variables must only be removed **after** the profile-aware code is deployed.
- Never remove `DATABASE_URL` or `SESSION_SECRET`.
- Unused (do not set): `PUBLIC_URL`, `CANONICAL_DOMAIN`, `PUBLIC_SCHEMA`.

## What the profile derives

| Setting | Production | Staging |
| --- | --- | --- |
| Runtime | full application (`server.legacy`) | V5 foundation |
| Deployment environment | `production` | `testing` |
| Canonical domain | `blessboard.com` | `blessboard.org` |
| Apex domains | `.com` + `www` only | `.org` + `www` only |
| Session cookie | `blessboard_com_sid` | `blessboard_org_sid` |
| Expected DB identity env | `production` | `testing` |
| Scheduled jobs | enabled | disabled |
| Host context mode | off | diagnostic |
| Test users by default | never | never |

Registry: `src/platform/config/deploymentProfiles.js`

## Deprecated aliases (temporary)

| Old `PLATFORM_DEPLOYMENT_CODE` | Maps to | Behavior |
| --- | --- | --- |
| `blessboard-org-v5` | `blessboard-org-staging` | Accepted with one deprecation warning |
| `blessboard-com-v4` | `blessboard-com-production` | Accepted with one deprecation warning |

Update Hostinger to the canonical codes when convenient.

## Variables no longer required permanently

These may remain during transition (matching values → deprecation warning; conflicts → fatal):

- `DEPLOYMENT_ENV`
- `EXPECTED_DATABASE_ENV`
- `BASE_DOMAIN`
- `BLESSBOARD_CANONICAL_DOMAIN`
- `BLESSBOARD_APEX_DOMAINS`
- `BLESSBOARD_PUBLIC_URL`
- `BLESSBOARD_ADMIN_URL`
- `CHURCH_HOST_DOMAIN`
- `SESSION_COOKIE_NAME`
- `BLESSBOARD_JOBS_ENABLED`
- `PLATFORM_HOST_CONTEXT_MODE`
- `TRUST_PROXY`
- `HOST`
- `DATABASE_IDENTITY_EXPECTED` (HTTP startup uses profile; keep for CLI tools only)
- `ADMIN_PASSWORD` (not required by either official BlessBoard profile)
- `BLESSBOARD_ALLOW_TEST_USERS*` / `BLESSBOARD_INITIALIZE_DB_IDENTITY` (CLI-only; never auto at startup)

Security-sensitive conflicts (wrong env, foreign TLD, wrong cookie sibling, staging jobs enabled, etc.) fail startup.

## Staged Hostinger migration

### Stage A — V5 / staging

1. Deploy profile-aware code to the `V5` branch Hostinger app (`blessboard.org`).
2. Keep current staging variables.
3. Verify `/healthz` → `ok` + `mode: v5-foundation`.
4. Verify www → `blessboard.org` only (never `.com`).

### Stage B — main / production

1. Cherry-pick or merge the **configuration** architecture onto `main` (see deliverable / PR notes — not unrelated V5 product features).
2. Keep current production variables.
3. Verify `/healthz` → `ok` without staging mode.
4. Verify www → `blessboard.com` only (never `.org`).

### Stage C — staging cleanup (one group per restart)

1. Domain duplicates
2. Session / jobs / host defaults
3. Deployment aliases (`DEPLOYMENT_ENV`, `EXPECTED_DATABASE_ENV`, `BASE_DOMAIN`)
4. CLI-only leftovers and `ADMIN_PASSWORD`

### Stage D — production cleanup (one group per restart)

Same groups as Stage C. Final panel keys match the production template above.

## Related docs

- `docs/deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md` — V5/staging detail + legacy notes
- `docs/deployment/V5_HOSTINGER_MINIMAL_ENV.md` — staging cleanup checklist (superseded in spirit by this doc)
