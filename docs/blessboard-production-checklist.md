# BlessBoard Production Checklist

Deploy and operate BlessBoard (`blessboard.com`, `*.blessboard.com`) alongside GetPro (`getproapp.org`).

**Last updated:** 2026-07-10

---

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` or `GETPRO_DATABASE_URL` | **Yes** | PostgreSQL connection (app exits without it) |
| `SESSION_SECRET` | **Yes** | Express session signing |
| `BASE_DOMAIN` | Recommended | Platform host (e.g. `getproapp.org`) |
| `CHURCH_HOST_DOMAIN` | Optional | Default `blessboard.com` |
| `GETPRO_PG_SSL` | If Supabase | `strict`, `no-verify`, or `off` |
| `NODE_ENV` | Recommended | `production` |

Never commit secrets. Set in Hostinger **Environment variables** panel.

---

## Hostinger Node.js deployment

| Setting | Value |
|---------|-------|
| App directory | Repository root |
| Install | `npm ci` or `npm install` |
| Build | `npm run build` (or at minimum `npm run build:assets`) |
| Start | `npm start` → `node index.js` → `server.js` |
| Output directory | **Leave empty** (backend-only Express app) |

### GitHub branch V4 deploy steps

1. Push to the deployment branch (e.g. `V4`)
2. Pull on Hostinger or connect Git auto-deploy
3. Run install + build + restart (see below)
4. Verify logs show PostgreSQL connected and church schema ensured

---

## Migration / schema

Schema is applied automatically at startup via `ensureChurchSchema` in `server.js`.

To verify manually after deploy:

```bash
# On server with DATABASE_URL set
node -e "require('./src/db/pg/ensureChurchSchema').ensureChurchSchema(require('./src/db/pg').getPgPool()).then(()=>console.log('ok')).catch(console.error)"
```

Latest church migrations include `089_church_sermons_resources.sql` (sermons/resources tables).

---

## Seed command

Demo church seed runs **automatically** on server boot (`seedChurchDemoOrganizationIfMissing`).

Idempotent — safe to restart multiple times:

- Creates `demo.blessboard.com` org/branch if missing
- Does not duplicate admins or content

Manual trigger (optional, with `DATABASE_URL` set):

```bash
node -e "const p=require('./src/db/pg'); p.ensureChurchSchema(p.getPgPool()).then(()=>require('./src/seeds/seedChurchDemoOrganization').seedChurchDemoOrganizationIfMissing(p.getPgPool())).then(()=>console.log('seed ok')).catch(e=>{console.error(e);process.exit(1)})"
```

---

## SSL setup

### blessboard.com (apex + www)

1. Add `blessboard.com` and `www.blessboard.com` to Node.js app domains
2. Issue SSL certificates in hPanel
3. Confirm apex shows BlessBoard landing page

### Wildcard `*.blessboard.com` (recommended)

1. DNS: `*.blessboard.com` → server IP
2. Wildcard SSL certificate
3. Attach wildcard domain to the **same Node.js process** that runs BlessBoard routing

### Per-church subdomain (without wildcard)

For each church (e.g. `kafuebaptist.blessboard.com`):

1. Create subdomain in hPanel
2. Route to Node.js app (not static `public_html`)
3. Issue SSL for that subdomain

---

## Restart app

Hostinger hPanel → **Node.js** → your application → **Restart**.

Or SSH:

```bash
cd /path/to/getpro
git pull
npm ci
npm run build
# Restart via panel or process manager
```

After restart, check logs for:

```
[getpro] PostgreSQL ...
[church] demo seed ...
```

---

## URLs to test after deploy

| URL | Expected |
|-----|----------|
| `https://blessboard.com` | BlessBoard landing, Powered by GetPro |
| `https://demo.blessboard.com` | Demo church homepage |
| `https://demo.blessboard.com/about` | DB-backed about content |
| `https://demo.blessboard.com/register` | Member registration form |
| `https://demo.blessboard.com/branch/login` | Branch admin login |
| `https://getproapp.org` | GetPro platform unchanged |
| `https://getproapp.org/admin/church` | Super admin church console |
| `https://unknownslug.blessboard.com` | Church not found (404) |

---

## Onboarding a new church

See [blessboard-church-onboarding.md](./blessboard-church-onboarding.md).

Quick steps:

1. `/admin/church/organizations/new`
2. Set branch host slug (e.g. `kafuebaptist`)
3. Provision → test `https://kafuebaptist.blessboard.com`

---

## Common errors

### SSL protocol error

**Cause:** Browser hits wrong vhost (static Apache) or cert not issued for subdomain.

**Fix:** Ensure subdomain is on Node.js app domains list with valid SSL. Prefer wildcard `*.blessboard.com`.

### Church not found

**Cause:** No branch with matching `host_slug`, or Host header not forwarded.

**Fix:**

1. Confirm row in `church_branches.host_slug`
2. Check reverse proxy forwards `Host` header
3. Enable `GETPRO_LOG_CHURCH_HOST=1` and inspect logs

### 503 Service Unavailable

**Cause:** Branch/org suspended or archived; or startup/routing error.

**Fix:**

1. Check `church_branches.status` and `church_organizations.status` = `active`
2. Review server logs for middleware errors
3. Verify `DATABASE_URL` is set (503 on all routes if pool fails at boot)

### Duplicate seed / admin error

**Cause:** Re-running seed without idempotent guards (older builds).

**Fix:** Current seed uses `ON CONFLICT` / count checks. Restart is safe. If duplicate key persists, check for manual DB inserts with same email/username.

### Host not forwarded correctly

**Cause:** LiteSpeed/proxy strips or rewrites `Host`.

**Fix:** Set `trust proxy` (already in `server.js`), ensure `X-Forwarded-Host` or original Host reaches Express. Test with:

```bash
curl -I -H "Host: demo.blessboard.com" https://your-server/
```

### Wrong product on subdomain

**Cause:** Request hits GetPro company routing instead of church context.

**Fix:** Confirm `attachChurchContext` runs before tenant guards; `CHURCH_HOST_DOMAIN=blessboard.com`.

---

## Commands reference

```bash
# Targeted tests
npm test -- tests/church-onboarding.test.js tests/church-content-management.test.js tests/church-blessboard-subdomains.test.js

# Full suite
npm test
```

---

## Related docs

- [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)
- [blessboard-content-management.md](./blessboard-content-management.md)
- [blessboard-screen-implementation-status.md](./blessboard-screen-implementation-status.md)
