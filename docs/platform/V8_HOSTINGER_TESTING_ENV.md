# V8 Hostinger testing — domain isolation

**Status:** Code ready — Hostinger DNS / Node app binding is a **manual** step  
**Deployment code:** `moovex-platform-v8-testing`  
**Shared DB identity:** `moovex-platform-v7` / `environment_code=testing` (same PostgreSQL as V7 testing)  
**Policy:** [`V8_DEVELOPMENT_POLICY.md`](./V8_DEVELOPMENT_POLICY.md) · [`V8_DB_COMPATIBILITY_BASELINE.md`](../database/V8_DB_COMPATIBILITY_BASELINE.md)

## Host map

| Line | Host | Product | Cookie (profile) |
|------|------|---------|------------------|
| V7 | `blessboard.pronline.org` | BlessBoard | `moovex_platform_testing_sid` (unified) |
| V7 | `activeclinic.pronline.org` | ActiveClinic | `moovex_platform_testing_sid` |
| V8 | `blessboard.neuniversity.org` | BlessBoard | `moovex_platform_v8_testing_sid` |
| V8 | `activeclinic.neuniversity.org` | ActiveClinic | `moovex_platform_v8_testing_sid` |

One Node.js process **can** serve both V8 hosts (Topology A — same as V7 `moovex-platform-testing`). Prefer a **separate Hostinger Node app** for V8 so V7 restarts and env are untouched.

## Required Hostinger env (V8 app only)

Do **not** invent credentials. Copy secrets from your operator vault; use a **distinct** `SESSION_SECRET` from the V7 testing app.

```env
NODE_ENV=production
DEPLOYMENT_ENV=testing
PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing
DATABASE_URL=<same V7 testing PostgreSQL URL>
DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
DATABASE_IDENTITY_ENV=testing
SESSION_SECRET=<distinct long random secret for V8>
```

Optional:

```env
PORT=3000
GETPRO_PG_SSL=no-verify
MEDIA_STORAGE_ROOT=/home/<account>/moovex-media
MEDIA_PUBLIC_BASE_URL=https://blessboard.neuniversity.org/media
MEDIA_PUBLIC_MOUNT_PATH=/media
GETPRO_GIT_SHA=<deployed commit>
```

**Fail closed if:** `DEPLOYMENT_ENV=production`, `DATABASE_IDENTITY_ENV=production`, missing required keys, or jobs enabled.

## DNS (manual)

1. Create A/CNAME records for:
   - `blessboard.neuniversity.org`
   - `activeclinic.neuniversity.org`
   - (optional hub) `neuniversity.org` / `www.neuniversity.org`
2. Point them at the **V8** Hostinger Node app (not the V7 pronline worker).
3. Issue SSL certificates for each hostname in hPanel.
4. Leave `*.pronline.org` DNS and V7 app bindings unchanged.

## Application / restart

1. Deploy **branch `V8`** to a new Hostinger Node application (separate from V7 testing).
2. Set the env block above; restart the V8 worker only.
3. Smoke: `https://blessboard.neuniversity.org/healthz` and `https://activeclinic.neuniversity.org/healthz`.
4. Confirm V7 still answers on `*.pronline.org` with its own SHA.

## Isolation guarantees (code)

| Concern | Behavior |
|---------|----------|
| Product routing | Hostname allowlist → product (`blessboard` / `activeclinic`) |
| Wrong host | Host not in V8 `apexDomains` → HTTP 421 `PLATFORM_HOST_NOT_IN_DEPLOYMENT` |
| Cookies | Host-only (no `Domain=`); distinct V8 cookie names |
| Secrets | Separate `SESSION_SECRET` on V8 Hostinger app |
| Jobs / notifications | `jobsEnabled=false`; outbound side-effects refused |
| Media writes | Namespace `testing-v8/…`; V7 keeps `testing/…`; V8 can still **read** existing published `testing/` keys |
| Temp / caches | `isolationNamespace=v8-testing` under OS tmp / `GETPRO_ISOLATION_TMP_ROOT` |
| Database | Shared testing DB; additive schema only ([compatibility baseline](../database/V8_DB_COMPATIBILITY_BASELINE.md)) |

## Preserve V7

| Item | Unchanged |
|------|-----------|
| Deployment code | `moovex-platform-testing` |
| Hosts | `blessboard.pronline.org`, `activeclinic.pronline.org` |
| Cookies | `moovex_platform_testing_sid` / csrf |
| Media writes | `testing/…` |
| Docs | [`V7_HOSTINGER_TESTING_ENV.md`](./V7_HOSTINGER_TESTING_ENV.md) |

## Infrastructure blocker checklist

Report **READY_FOR_HOSTING_SETUP** until all are done:

- [ ] `neuniversity.org` DNS zone controllable in Hostinger (or parent DNS)
- [ ] A/CNAME for BB + AC V8 hosts
- [ ] Separate Node.js application created for V8
- [ ] SSL issued for V8 hosts
- [ ] Env vars set (distinct `SESSION_SECRET`, shared testing `DATABASE_URL`)
- [ ] V8 worker restarted on branch `V8`
- [ ] Concurrent smoke: V7 + V8 `/healthz` both OK

Do not modify production Hostinger profiles or invent passwords in git.
