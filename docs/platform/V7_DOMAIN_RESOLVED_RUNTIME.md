# V7 Domain-Resolved Runtime

## Model

```text
PLATFORM_DEPLOYMENT_CODE
        ↓
environment + DB identity expectation
        +
request hostname (exact allowlist)
        ↓
product / brand / siteType / host-scoped cookies
```

Canonical platform DB identity (both environments, **separate physical DBs**):

```text
identity_key = moovex-platform-v7
environment_code = testing | production
```

HTTP startup verifies **both** when the deployment profile sets `expectedIdentityKey`
(e.g. `moovex-platform-testing` / `moovex-platform-production`).

## Profiles

| Code | Role |
| ---- | ---- |
| `moovex-platform-testing` | Canonical testing runtime; `productSelection=hostname` |
| `moovex-platform-production` | Canonical production runtime; `productSelection=hostname` |
| `*-pronline-testing` / `*-org-production` etc. | Transitional product-specific profiles (Topology B) |

## Host allowlist

`src/platform/config/canonicalHostRegistry.js` — exact match only.

Unknown host → `UNKNOWN_PLATFORM_HOST` (fail closed).  
Environment mismatch → `PLATFORM_ENVIRONMENT_HOST_MISMATCH` (fail closed).

## Proxy / hostname trust

`resolveRequestHostname` uses existing `src/platform/host.js#resolveHostname`:

- `trust proxy` is a hop **number** (default `1` on profiles), not unrestricted `true`
- First `X-Forwarded-Host` hop only when trust proxy is enabled
- Then exact allowlist — forged hosts cannot invent products

## Request context

`req.platform` is frozen:

```text
environment, productKey, brand, canonicalHost, siteType,
sessionCookieName, csrfCookieName, deploymentCode, …
```

Hostname never grants org entitlement. Access still requires:

```text
identity → organization → organization_products → RBAC
```

## Sessions

Host-scoped cookies (no `Domain=.pronline.org`). Cookie names come from the host registry under platform runtimes.

## Topologies

**A:** One Node process, many approved domains, `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing`.  
**B:** Multiple Hostinger apps, same branch/SHA/DB/identity, same or transitional codes; hostname still authoritative when using platform profiles.

## BlessBoard.org

Registered as `siteType=legacy-redirect` → `https://blessboard.com`.  
Not activated unless `BLESSBOARD_ORG_REDIRECT_ENABLED=1` (do not set on Hostinger yet).

## Testing identity migration

**Status (testing DB):** completed — `platform.database_identity` singleton on the testing Supabase project
(`project hint xpcpv…`, `environment_code=testing`) now uses `identity_key=moovex-platform-v7`.

Apply / re-check (idempotent):

```bash
npm run db:identity:migrate-testing-to-moovex-v7 -- \
  --confirm migrate-testing-identity-to-moovex-platform-v7

DATABASE_IDENTITY_EXPECTED=moovex-platform-v7 \
  npm run db:identity:check:testing
```

Historical note: testing previously used `blessboard-platform-v5`. Production still uses its own identity row
(`environment_code=production`) and is **not** migrated by this operation.

**Do not** run the testing migrator against production.

## FunSong

`funsong.org` is not in the allowlist and remains outside the platform.
