# BlessBoard V5 — Environment variable reference

**Date:** 2026-07-19  
**Scope:** BlessBoard V5 foundation / Hostinger testing deployment (`PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, `DEPLOYMENT_ENV=testing`).  
**Constraint:** This document does **not** change Hostinger values, enable routing modes, or print secrets.

**Code:** `src/platform/config/v5EnvValidation.js` · `v5FoundationMode.js` · `platformDeploymentCode.js` · `tenantRoutingMode.js` · `authoritativeHostAllowlist.js` · `mediaUploadsEnabled.js` · `writeMaintenance.js` · `platformHostContextMode.js` · `src/db/pg/pool.js` · `src/startup/productionEnvGate.js` · `db/scripts/lib/databaseIdentity.js` · `src/platform/session/v5SessionCookie.js`

**Companions:** [`V5_SHADOW_ROUTING_READINESS.md`](./V5_SHADOW_ROUTING_READINESS.md) · [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) · [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) · [`V5_AUTHORITATIVE_PILOT_ALLOWLIST_DESIGN.md`](./V5_AUTHORITATIVE_PILOT_ALLOWLIST_DESIGN.md) · [`V5_SESSION_COOKIE_AUDIT.md`](../security/V5_SESSION_COOKIE_AUDIT.md)

---

## Safety principles

| Rule | Behavior |
|------|----------|
| No secret logging | Diagnostics log **presence** (`yes`/`no`) only for `DATABASE_URL`, `SESSION_SECRET`, etc. |
| No URL printing | Connection strings are never logged; host fingerprints are redacted |
| No legacy DB fallback on V5 | In V5 foundation mode, `GETPRO_DATABASE_URL` is **ignored** even if set |
| Safe routing default | Unset / invalid `BLESSBOARD_TENANT_ROUTING_MODE` → `off` (fail-closed) |
| Safe authoritative pilot | `authoritative` without `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` → foundation only (no estate serve) |
| Safe host-context default | Unset / invalid `PLATFORM_HOST_CONTEXT_MODE` → `off` |
| Safe jobs on V5 | Foundation process does not start workers; `areBlessBoardJobsEnabled()` is **false** in foundation mode; `blessboard-org-v5` unset/invalid → **disabled** |
| Safe media uploads | Unset / invalid `BLESSBOARD_MEDIA_UPLOADS_ENABLED` → **disabled** (fail-closed); explicit `1` required to upload |
| Safe write maintenance | Unset `BLESSBOARD_WRITE_MAINTENANCE` → **off**; explicit enable blocks state-changing HTTP (fail-closed for writes) |
| No silent testing↔production confusion | `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` **requires** `DEPLOYMENT_ENV=testing` or process exits (refuses legacy path) |
| Secure cookies in production | `Secure` flag when `NODE_ENV=production` (session + CSRF cookies) |

---

## Variable catalogue

| Variable | Required | Allowed values/format | Sensitive | Purpose | Failure behavior |
|----------|----------|----------------------|-----------|---------|------------------|
| `NODE_ENV` | Recommended (`production` on Hostinger) | Common: `production`, `development`, `test` | No | Runtime profile: Secure cookies, production env gate, CSRF secret strictness | Unset → non-production cookie/CSRF leniency; production gate skipped. Does **not** select V5 foundation mode. |
| `DEPLOYMENT_ENV` | **Yes** for V5 foundation | `testing` \| `production` (case-insensitive). V5 foundation today requires **`testing`**. | No | Deployment intent (distinct from `NODE_ENV`). Paired with `PLATFORM_DEPLOYMENT_CODE` for foundation mode. | Missing/unsupported with code `blessboard-org-v5` → **FATAL exit** (no legacy fall-through). Demo visibility treats unknown as production-safe (hide demos). |
| `DATABASE_URL` | **Yes** | Postgres URI (`postgres://` / `postgresql://`) | **Yes** | Sole V5 database connection | Missing → process exits (`isPgConfigured` false). Never logged as value. |
| `DATABASE_IDENTITY_EXPECTED` | **Yes** for identity CLI / migration gates | kebab-case `[a-z0-9]+(-[a-z0-9]+)*` (e.g. `blessboard-platform-v5`) | No | Expected `platform.database_identity.identity_key` | Invalid format → CLI exit 1. Mismatch → refuse migrate/check. Distinct from `PLATFORM_DEPLOYMENT_CODE`. |
| `PLATFORM_DEPLOYMENT_CODE` | **Yes** for V5 | kebab-case; V5 value **`blessboard-org-v5`** | No | Running app deployment identity (vs domain row comparison) | Missing/invalid → not foundation mode; diagnostic comparison skipped. Invalid pattern → `status=invalid`. |
| `PLATFORM_HOST_CONTEXT_MODE` | No (default safe) | `off` \| `diagnostic` | No | Optional hostname resolution diagnostics | Unset/invalid → **`off`** (warn once). Never enables tenant routing. |
| `BLESSBOARD_TENANT_ROUTING_MODE` | No (default safe) | `off` \| `shadow` \| `authoritative` | No | Tenant-host routing feature flag | Unset/invalid → **`off`** (warn once). **Not** inferred from `NODE_ENV`, hostname, or Git. Do not enable from this audit. |
| `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` | Required when mode=`authoritative` (pilot-safe) | Comma/whitespace-separated **exact** hostnames (normalized lowercase, trailing dots stripped). Lone `*` = estate allow-all (signed cutover only). No `*.domain` wildcards. | No (hostnames OK to log) | Restricts which resolved hosts may receive tenant HTML under `authoritative` | **Empty/unset + authoritative** → fail-closed foundation (`authoritative_allowlist_empty`). Unlisted host → foundation (`authoritative_host_not_allowlisted`) + shadow-style diagnostics. Invalid entries dropped (warn once). Deployment mismatch still fails closed independently. **Do not set on Hostinger from docs alone.** |
| `BLESSBOARD_JOBS_ENABLED` | Recommended `0` on V5 Hostinger | Disable: `0`\|`false`\|`no`\|`off`. Enable: `1`\|`true`\|`yes`\|`on`. | No | Master switch for cron/ops job scripts | **V5 foundation** → always disabled. **`blessboard-org-v5`** with unset/invalid → **disabled** (fail-closed). Other (V4) deployments: unset → enabled. Unsupported on V4 → treat enabled + parse `ok:false`. **Do not enable on Hostinger from this doc.** |
| `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | Recommended unset/`0` until ops opt-in | Disable: unset\|`0`\|`false`\|`no`\|`off`. Enable: `1`\|`true`\|`yes`\|`on`. | No | Process-wide kill switch for HQ/BA media **upload** POSTs (service + route) | Unset/invalid → **disabled** (fail-closed). List/read/archive unchanged. Does **not** replace authz or package entitlements. **Do not enable on Hostinger from this doc.** |
| `BLESSBOARD_WRITE_MAINTENANCE` | Recommended unset/`0` | Off: unset\|`0`\|`false`\|`no`\|`off`. On: `1`\|`true`\|`yes`\|`on`. | No | Global **write freeze** for migrate/cutover: blocks `POST`/`PUT`/`PATCH`/`DELETE` with **503** + fixed message; **GET**/`HEAD`/`OPTIONS` and logout POSTs allowed; `/healthz` stays **200** with `writeMaintenance` flag | Unset → **off**. Unsupported non-empty → **on** (fail-closed for writes). Forces jobs off while enabled. No PA break-glass. Host-agnostic (apex / tenant / custom domain). **Do not enable on Hostinger from this doc.** |
| `SESSION_SECRET` | **Yes** in production | Opaque string, **≥32 characters** in production | **Yes** | V5 session HMAC / CSRF signing | Production missing/short → **FATAL** on V5 start / production gate. Presence only in logs. Dev may use fallback CSRF secret (not for Hostinger). |
| `SESSION_COOKIE_NAME` | Recommended | Non-empty cookie name; V5 default `blessboard_org_v5_sid` | No | Host-only session cookie name | Unset → V5 default. Must **not** set cookie `Domain=.blessboard.org` (not an env var — code omits `domain`). |
| `BASE_DOMAIN` | **Yes** when `NODE_ENV=production` | Hostname without scheme (V5: `blessboard.org`) | No | Apex / marketing URL construction | Production missing → **FATAL** (`productionEnvGate`). |
| `PUBLIC_SCHEME` | No | `http` \| `https` (default **`https`**) | No | Public absolute URL scheme with `BASE_DOMAIN` | Unset → `https`. Unsupported → parse rejects; callers that read raw env may still see typo — prefer `https` in panels. |
| `GETPRO_DATABASE_URL` | **Must remain unset** on V5 | N/A (legacy GetPro / V4 fallback) | **Yes** | Legacy alternate DB URL | In V5 foundation / org-testing isolation: **ignored**. If set, startup warns presence-only; never used as fallback. |

---

## Related V5 Hostinger companions (not in minimum set)

Documented in shadow readiness / runbooks; same no-secret rules apply:

| Variable | Notes |
|----------|--------|
| `BLESSBOARD_CANONICAL_DOMAIN` | `blessboard.org` |
| `BLESSBOARD_APEX_DOMAINS` | `blessboard.org,www.blessboard.org` |
| `BLESSBOARD_PUBLIC_URL` / `BLESSBOARD_ADMIN_URL` / `BLESSBOARD_APEX_ORIGIN` | `https://blessboard.org` family |
| `EXPECTED_DATABASE_ENV` | Optional; when set must match `DEPLOYMENT_ENV` or org DB isolation exits |
| `PORT` / `HOST` | Listen bind (defaults `3000` / `0.0.0.0`) |

Migration tooling uses **explicit** `V4_SOURCE_DATABASE_URL` / `V5_TARGET_DATABASE_URL` — never falls back to `DATABASE_URL`.

---

## Validation matrix (verify)

| Check | Result |
|-------|--------|
| Required absent → fail safe | `DATABASE_URL` missing exits boot; production missing `SESSION_SECRET`/`BASE_DOMAIN` exits; V5 pairing mismatch exits |
| Invalid enums rejected | Routing / host-context unsupported → not applied (`off`); parse helpers return `ok:false`; deployment code invalid → `status=invalid`; identity key invalid → CLI/migrate refuse |
| Secrets not logged | `workerEnvTrace`, `productionEnvGate`, V5 startup use yes/no only |
| `DATABASE_URL` not printed | Pool diagnostics use redacted host fingerprint / presence |
| `GETPRO_DATABASE_URL` unused for V5 | `pool.getDatabaseUrl()` returns `""` when foundation mode and only GetPro URL set |
| Production Secure cookies | `v5SessionCookie` / `v5Csrf` set `secure` when `NODE_ENV=production` |
| Routing default safe | Default `off` |
| Job default safe on V5 | Foundation: jobs false + no workers started; `blessboard-org-v5` unset → disabled; Hostinger should still set `BLESSBOARD_JOBS_ENABLED=0` |
| Media uploads default safe | Unset → disabled; startup logs enable/disable without secrets |
| Write maintenance default safe | Unset → off; when on, mutating methods **503**; healthz includes `writeMaintenance` boolean only |
| Testing vs production not confused silently | `blessboard-org-v5` without `DEPLOYMENT_ENV=testing` → FATAL before `server.legacy` |

---

## Operator checklist (values not printed here)

1. Confirm Hostinger panel has V5 pairing: code + `DEPLOYMENT_ENV=testing`.  
2. Confirm `DATABASE_URL` points at V5 platform DB only.  
3. Confirm `GETPRO_DATABASE_URL` unset.  
4. Confirm `BLESSBOARD_TENANT_ROUTING_MODE` is `off` unless an approved runbook flips it.  
5. If mode will ever be `authoritative`, require a signed allow-list (`BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST`) — empty fails closed. Rollback = clear allow-list and/or set mode `shadow`/`off`, restart all workers.  
6. Confirm cookie is host-only (no parent `Domain=`).  
7. Confirm `BLESSBOARD_JOBS_ENABLED=0`.  
8. Confirm `BLESSBOARD_MEDIA_UPLOADS_ENABLED` unset or `0` unless a signed ops decision enables uploads (`1`).  
9. Confirm `BLESSBOARD_WRITE_MAINTENANCE` unset or `0` except during an approved migrate/cutover write freeze.  
10. Confirm `SESSION_SECRET` length ≥32 and cookie name is V5-specific.  
11. Run `npm run db:identity:check` against the **intended** URL only.

---

## Tests

| Suite | Command |
|-------|---------|
| V5 env validation | `node --test tests/v5-environment-validation.test.js` |
| Foundation startup | `npm run test:v5:foundation-startup` |
| DB URL / GetPro isolation | `node --test tests/pg-env-diagnostics.test.js tests/church-blessboard-org-db-isolation.test.js` |
| Deployment code | `node --test tests/platform-host-comparison.test.js` |
| Routing mode | `node --test tests/blessboard-tenant-routing-mode.test.js` |
| Production gate | `node --test tests/production-env-gate.test.js` |
