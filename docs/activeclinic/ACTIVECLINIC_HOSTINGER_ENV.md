# ActiveClinic — Hostinger environment contract

**Deployment:** `https://activeclinic.org`  
**Canonical profile code:** `activeclinic-org-v6`  
**Registry:** `src/platform/config/deploymentProfiles.js`

Do not invent alternate codes such as `activeclinic-org-testing`. Unknown codes fail closed at startup.

## Required Hostinger variables

```env
DATABASE_URL=<ActiveClinic testing database>
SESSION_SECRET=<strong secret>
NODE_ENV=testing
DEPLOYMENT_ENV=testing
PLATFORM_DEPLOYMENT_CODE=activeclinic-org-v6
```

### Optional (recommended)

```env
GETPRO_PG_SSL=no-verify
# UPLOAD_ROOT=<deployment-scoped absolute path>   # isolates uploads from BlessBoard hosts
```

`DATABASE_URL` and `SESSION_SECRET` values must never be logged or committed.

## Hostinger typo that causes 503

Replace:

```env
PLATFORM_DEPLOYMENT_CODE=activeclinic-org-testing
```

with:

```env
PLATFORM_DEPLOYMENT_CODE=activeclinic-org-v6
```

`activeclinic-org-testing` is **not** registered. Startup exits intentionally; Hostinger surfaces a 503.

## What the profile derives

| Setting | Value |
| --- | --- |
| Product | `activeclinic` |
| Deployment environment | `testing` |
| Expected DB environment | `testing` |
| Canonical domain | `activeclinic.org` |
| Public / admin origin | `https://activeclinic.org` |
| Apex domains | `activeclinic.org`, `www.activeclinic.org` only |
| Session cookie | `activeclinic_org_sid` |
| CSRF cookie | `activeclinic_org_csrf` |
| Scheduled jobs | disabled |
| Host context mode | diagnostic |
| Foreign TLDs (blocked if set as apex) | BlessBoard `.com` / `.org` |

`DEPLOYMENT_ENV=testing` is recommended for operator clarity. If unset while `PLATFORM_DEPLOYMENT_CODE=activeclinic-org-v6`, the profile still derives `testing` and ActiveClinic domains — it does **not** fall back to BlessBoard production.

## Variables that must not be set to BlessBoard values

Do not set any of these to BlessBoard production/staging values on the ActiveClinic Hostinger app:

- `BLESSBOARD_CANONICAL_DOMAIN`
- `BLESSBOARD_APEX_DOMAINS`
- `BLESSBOARD_PUBLIC_URL` / `BLESSBOARD_ADMIN_URL`
- `CHURCH_HOST_DOMAIN`
- `SESSION_COOKIE_NAME` / `CSRF_COOKIE_NAME`
- `BASE_DOMAIN`

Conflicts with the profile fail closed.

## Restart checklist

1. Set `PLATFORM_DEPLOYMENT_CODE=activeclinic-org-v6` (and the other required keys above).
2. Redeploy or restart the Node worker.
3. Confirm `/healthz` returns 200 with ActiveClinic product markers.
4. Confirm `https://activeclinic.org` loads.
5. Confirm startup logs show `canonical domain: activeclinic.org` and do **not** mention `blessboard.com` as the selected domain.
