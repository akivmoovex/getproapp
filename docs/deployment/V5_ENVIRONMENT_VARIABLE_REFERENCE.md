# BlessBoard V5 — Environment variable reference

**Date:** 2026-08-01  
**Scope:** BlessBoard V5 foundation / Hostinger testing deployment (`PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`).  
**Constraint:** This document does **not** change Hostinger values or print secrets.

**Code:** `src/platform/config/deploymentProfiles.js` · `v5EnvValidation.js` · `v5FoundationMode.js` · `platformDeploymentCode.js` · `src/church/blessBoardEnv.js` · `src/startup/productionEnvGate.js` · `src/platform/session/v5SessionCookie.js`

**Companions:** [`V5_SHADOW_ROUTING_READINESS.md`](./V5_SHADOW_ROUTING_READINESS.md) · [`V5_SESSION_COOKIE_AUDIT.md`](../security/V5_SESSION_COOKIE_AUDIT.md)

---

## Minimal permanent Hostinger set (blessboard.org)

```bash
NODE_ENV=production
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
DATABASE_URL=<testing database URL>
SESSION_SECRET=<unique testing secret ≥32 chars>
```

Optional when the database provider requires an explicit SSL mode:

```bash
GETPRO_PG_SSL=no-verify
```

All other former permanent variables are **derived** from the `blessboard-org-v5` deployment profile in `deploymentProfiles.js` (domains, jobs off, cookie name, trust proxy, listen host, deployment environment = testing).

---

## Safety principles

| Rule | Behavior |
|------|----------|
| Profile is authoritative | `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` selects V5 foundation + testing + blessboard.org domains |
| Unknown codes fail closed | Non-empty unknown `PLATFORM_DEPLOYMENT_CODE` → **FATAL** |
| Conflicting legacy vars | Security-sensitive conflicts (wrong domain / `DEPLOYMENT_ENV=production` / jobs on / prod cookie name) → **FATAL**; matching duplicates → deprecation warning |
| No secret logging | Presence only for `DATABASE_URL`, `SESSION_SECRET` |
| No legacy DB fallback | `GETPRO_DATABASE_URL` ignored in V5 foundation / org-testing |
| Jobs stay off | Profile `jobsEnabled=false`; `BLESSBOARD_JOBS_ENABLED=1` → **FATAL** |
| Test users never auto-created | Require explicit seed CLI + `BLESSBOARD_ALLOW_TEST_USERS=true`; production override flag is **not honored** |
| Secure cookies | Host-only; HttpOnly; SameSite=Lax; Secure when `NODE_ENV=production` |
| BASE_DOMAIN | **Not required** for V5 foundation; still required for legacy production |

---

## Derived from profile (no longer permanent on Hostinger)

| Former variable | Profile value |
|-----------------|---------------|
| `DEPLOYMENT_ENV` | `testing` |
| `EXPECTED_DATABASE_ENV` | `testing` |
| `BLESSBOARD_CANONICAL_DOMAIN` | `blessboard.org` |
| `BLESSBOARD_APEX_DOMAINS` | `blessboard.org,www.blessboard.org` |
| `BLESSBOARD_PUBLIC_URL` / `BLESSBOARD_ADMIN_URL` | `https://blessboard.org` |
| `CHURCH_HOST_DOMAIN` | `blessboard.org` |
| `SESSION_COOKIE_NAME` | `blessboard_org_v5_sid` |
| `BLESSBOARD_JOBS_ENABLED` | `false` |
| `PLATFORM_HOST_CONTEXT_MODE` | `diagnostic` |
| `TRUST_PROXY` | `1` |
| `HOST` | `0.0.0.0` |
| `BASE_DOMAIN` | not used (canonical from profile) |
| `ADMIN_PASSWORD` | not used by V5 foundation HTTP |
| `DATABASE_IDENTITY_EXPECTED` | CLI/migrate only (not HTTP startup) |

Matching legacy values may remain temporarily (Stage A) and emit one deprecation warning each.

---

## Still required / optional

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Recommended `production` | Secure cookies + production gate |
| `PLATFORM_DEPLOYMENT_CODE` | **Yes** (`blessboard-org-v5`) | Selects profile + foundation runtime |
| `DATABASE_URL` | **Yes** | Testing DB only |
| `SESSION_SECRET` | **Yes** (≥32 in production) | Never derived |
| `GETPRO_PG_SSL` | Optional | Keep if TLS must be forced (`no-verify` / `strict` / `off`) |
| `PORT` | Optional | Default `3000` |

---

## Unused / do not set

| Variable | Status |
|----------|--------|
| `PUBLIC_URL` | Unused (use profile / `BLESSBOARD_PUBLIC_URL` only as deprecated override) |
| `CANONICAL_DOMAIN` | Unused (use profile / `BLESSBOARD_CANONICAL_DOMAIN`) |
| `PUBLIC_SCHEMA` | Unused |
| `BLESSBOARD_ALLOW_TEST_USERS_IN_PRODUCTION` | Not honored; seed always refuses `NODE_ENV=production` |
| `GETPRO_DATABASE_URL` | Must remain unset on V5 |

---

## CLI-only (not permanent Hostinger runtime)

| Variable | Use |
|----------|-----|
| `DATABASE_IDENTITY_EXPECTED` | `db:identity:*`, migrate, hosted test-user seed |
| `BLESSBOARD_INITIALIZE_DB_IDENTITY` | One-time `church:v5:deploy-init` |
| `BLESSBOARD_ALLOW_TEST_USERS` | Explicit seed commands only |

---

## Related feature flags (unchanged defaults; not in minimal permanent set)

| Variable | Notes |
|----------|--------|
| `BLESSBOARD_TENANT_ROUTING_MODE` | Unset/invalid → `off` |
| `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` | Required only when mode=`authoritative` |
| `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | Unset → disabled |
| `BLESSBOARD_WRITE_MAINTENANCE` | Unset → off |
| `BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED` | Unset → enabled |
| `PUBLIC_SCHEME` | Default `https` |
| `SESSION_COOKIE_NAME` | Derived; matching duplicate deprecated |
| `PLATFORM_HOST_CONTEXT_MODE` | Derived as `diagnostic` |
| `BLESSBOARD_JOBS_ENABLED` | Derived off; `1` fatal |
| `BASE_DOMAIN` | Not required for V5 foundation |
| `DEPLOYMENT_ENV` | Derived as `testing` |
| `DATABASE_IDENTITY_EXPECTED` | CLI only |
| `GETPRO_DATABASE_URL` | Must remain unset |

---

## Staged Hostinger cleanup

1. **Stage A** — Deploy this code; leave existing Hostinger vars; confirm deprecation warnings + `/healthz` shows `mode:"v5-foundation"`.
2. **Stage B** — Remove duplicate groups one at a time (domains → session/jobs/host → deployment aliases → CLI flags → `ADMIN_PASSWORD`).
3. **Stage C** — Later PR: remove deprecated compatibility readers after one successful cycle.

Do **not** remove `DATABASE_URL`, `SESSION_SECRET`, or `PLATFORM_DEPLOYMENT_CODE`.
