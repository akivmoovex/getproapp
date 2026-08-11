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

## Testing identity migration (not auto-applied)

Current testing DBs may still use `blessboard-platform-v5`.

Before switching Hostinger to `moovex-platform-testing`:

1. Prove `DATABASE_URL` is the **testing** DB (`environment_code=testing`).
2. Backup / note current `identity_key`.
3. Update singleton:

```sql
UPDATE platform.database_identity
SET identity_key = 'moovex-platform-v7',
    updated_at = now()
WHERE id = 1
  AND environment_code = 'testing'
  AND identity_key = 'blessboard-platform-v5';
```

4. Set `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7` and `DATABASE_IDENTITY_ENV=testing`.
5. Set `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing`.
6. Verify startup identity log.

**Do not** run this against production. Production migration is documented separately and deferred.

## FunSong

`funsong.org` is not in the allowlist and remains outside the platform.
