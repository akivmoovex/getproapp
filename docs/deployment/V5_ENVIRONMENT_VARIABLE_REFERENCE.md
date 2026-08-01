# BlessBoard.org V5 — environment variable reference

**Canonical Hostinger guide (both .com and .org):**

[`BLESSBOARD_HOSTINGER_PROFILES.md`](./BLESSBOARD_HOSTINGER_PROFILES.md)

**Scope:** BlessBoard V5 foundation / Hostinger staging (`PLATFORM_DEPLOYMENT_CODE=blessboard-org-staging`, deprecated alias `blessboard-org-v5`).

## Permanent Hostinger keys (identical names on production)

```bash
NODE_ENV=production
PLATFORM_DEPLOYMENT_CODE=blessboard-org-staging
DATABASE_URL=<testing database URL>
SESSION_SECRET=<unique staging secret>
# Optional:
# GETPRO_PG_SSL=no-verify
```

Domains, deployment environment (`testing`), cookie (`blessboard_org_sid`), jobs off, trust proxy, listen host, and host-context mode are derived from the deployment profile in `src/platform/config/deploymentProfiles.js`.

| Rule | Behavior |
| --- | --- |
| Profile is authoritative | `PLATFORM_DEPLOYMENT_CODE=blessboard-org-staging` selects V5 foundation + testing + blessboard.org domains |
| Unknown code | Startup fatal |
| Matching legacy duplicates | Allowed with deprecation warning |
| Conflicting legacy duplicates | Startup fatal |
| `BASE_DOMAIN` | **Not required** when a BlessBoard profile is active; still required for unprofiled legacy production |
| Test users | Never created at normal startup; CLI only; refused when `NODE_ENV=production` |
| Unused | `PUBLIC_URL`, `CANONICAL_DOMAIN`, `PUBLIC_SCHEMA` — do not set |

## Derived (do not set permanently)

| Variable | Staging profile value |
| --- | --- |
| Deployment environment | `testing` |
| Runtime | `v5-foundation` |
| Canonical / public / admin | `blessboard.org` / `https://blessboard.org` |
| Apex | `blessboard.org`, `www.blessboard.org` |
| Cookie | `blessboard_org_sid` |
| Jobs | disabled |
| Expected DB env | `testing` |

Legacy names that used to be permanent (`DEPLOYMENT_ENV`, `BLESSBOARD_CANONICAL_DOMAIN`, `BLESSBOARD_APEX_DOMAINS`, `BLESSBOARD_PUBLIC_URL`, `BLESSBOARD_ADMIN_URL`, `CHURCH_HOST_DOMAIN`, `SESSION_COOKIE_NAME`, `BLESSBOARD_JOBS_ENABLED`, `PLATFORM_HOST_CONTEXT_MODE`, `TRUST_PROXY`, `HOST`, `BASE_DOMAIN`, `EXPECTED_DATABASE_ENV`) are optional during transition only.

## Optional / operational

| Variable | Required? | Notes |
| --- | --- | --- |
| `NODE_ENV` | **Yes** (`production` on Hostinger) | Hostinger runtime |
| `PLATFORM_DEPLOYMENT_CODE` | **Yes** (`blessboard-org-staging`) | Selects profile + foundation runtime |
| `DATABASE_URL` | **Yes** | Testing DB only; no `GETPRO_DATABASE_URL` fallback |
| `SESSION_SECRET` | **Yes** | Unique ≥32 chars; different from production |
| `GETPRO_PG_SSL` | Optional | Same policy as production (`no-verify` when needed) |
| `PORT` | Optional | Platform default |
| `BLESSBOARD_TENANT_ROUTING_MODE` | Optional | Feature flag |
| `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | Optional | Feature flag |
| `BLESSBOARD_WRITE_MAINTENANCE` | Optional | Kill switch |
| `DATABASE_IDENTITY_EXPECTED` | CLI only | Platform identity key for ops scripts |
| `BASE_DOMAIN` | Not required for profile | Legacy unprofiled hosts only |
| `PUBLIC_SCHEME` | Optional | Defaults https |
| `GETPRO_DATABASE_URL` | Must stay unset on staging | Prevents silent prod DB use |
| `ADMIN_PASSWORD` | Not required | V5 foundation / official profiles |
| `SESSION_COOKIE_NAME` | Not required | Profile supplies `blessboard_org_sid` |
| `BLESSBOARD_JOBS_ENABLED` | Not required | Profile forces off; enable is fatal |
| `PLATFORM_HOST_CONTEXT_MODE` | Not required | Profile default `diagnostic` |
| `DEPLOYMENT_ENV` | Not required | Derived `testing` |

## Deprecated alias

`PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` still works and maps to `blessboard-org-staging` with one warning. Prefer the staging code on Hostinger.
