# BlessBoard Production Checklist

Deploy and operate BlessBoard (`blessboard.com`, `*.blessboard.com`) alongside GetPro (`getproapp.org`).

**Last updated:** 2026-07-10

---

## Deploy V4 to Hostinger

Use this sequence for every production deploy of branch **V4** (operational readiness through migration **090**).

| Step | Action | Verify |
|------|--------|--------|
| 1 | **Pull latest V4** — SSH or Hostinger Git deploy: `git fetch && git checkout V4 && git pull origin V4` | `git log -1` shows expected commit |
| 2 | **Install dependencies** — `npm ci` (preferred) or `npm install` | No install errors |
| 3 | **Build assets** — `npm run build` or `npm run build:assets` | CSS/JS bundles present |
| 4 | **Run migrations** — automatic on boot via `ensureChurchSchema`; optional manual check below | Logs show schema ensured; migration **090** features present |
| 5 | **Run seed/demo script if needed** — demo seed is idempotent on boot; manual trigger only if demo missing | `demo.blessboard.com` resolves |
| 6 | **Restart Node app** — hPanel → Node.js → **Restart** | Process PID / uptime resets |
| 7 | **Verify logs** — PostgreSQL connected, church schema ensured, demo seed ok | No unhandled startup errors |
| 8 | **Test URLs** — run [blessboard-pilot-smoke-test.md](./blessboard-pilot-smoke-test.md) | Demo + getproapp.org pass before pilot provision |

### Environment check before restart

Confirm in Hostinger **Environment variables**:

- `DATABASE_URL` or `GETPRO_DATABASE_URL`
- `SESSION_SECRET` (≥ 32 characters)
- `NODE_ENV=production`
- `BASE_DOMAIN=getproapp.org`
- `CHURCH_HOST_DOMAIN=blessboard.com` (optional; default is blessboard.com)

### Post-deploy super admin diagnostics

Open `https://blessboard.com/admin/diagnostics` (super admin only). Confirm:

- Database reachable: **Yes**
- Latest migration label: **090_church_operational_readiness.sql**
- Demo branch: **Yes**
- No SESSION_SECRET length warning

---

## Hostinger deployment architecture

**Recommended:** One shared Git repo / codebase. Product behavior is selected by **hostname** at runtime:

| Host | Product |
|------|---------|
| `getproapp.org` | GetPro / Pro-online platform admin |
| `blessboard.com` | BlessBoard platform admin + landing |
| `*.blessboard.com` | Church public sites + branch/member portals |

### Which Node.js app folder should run BlessBoard admin?

BlessBoard platform admin (`/admin/login`, `/admin/churches`, `/admin/diagnostics`) must be served from the **blessboard.com** Node.js app folder:

- `/home/u549637099/domains/blessboard.com/nodejs` (or your blessboard.com app root)

That folder must deploy the **same repo** as getproapp.org (branch V4), with:

- `DATABASE_URL` / `GETPRO_DATABASE_URL` (same PostgreSQL as GetPro)
- `SESSION_SECRET` (≥ 32 characters)
- `BASE_DOMAIN=getproapp.org`
- `CHURCH_HOST_DOMAIN=blessboard.com`

### getproapp.org folder

The getproapp.org Node.js app continues to run GetPro admin only. Legacy BlessBoard routes redirect to blessboard.com:

- `/admin/church/*` → `https://blessboard.com/admin/...` (302)

You do **not** need getproapp.org to carry BlessBoard admin code for provisioning to work — deploy the latest codebase to **both** Hostinger Node apps, or point both domains at one Node process if Hostinger allows multiple domains on one app.

### Same codebase vs separate deployments

| Approach | Recommendation |
|----------|----------------|
| **Same repo, two Hostinger Node apps** | ✅ Supported — both pull V4; hostname routing selects product |
| **Same repo, one Node app, both domains attached** | ✅ Best if available — single deploy, no version drift |
| **Different code versions per domain** | ❌ Avoid — causes “Cannot GET /admin/church/...” on getproapp.org |

---

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` or `GETPRO_DATABASE_URL` | **Yes** | PostgreSQL connection (app exits without it) |
| `SESSION_SECRET` | **Yes** | Express session signing |
| `BASE_DOMAIN` | Recommended | Platform host (e.g. `getproapp.org`) |
| `CHURCH_HOST_DOMAIN` | Optional | Default `blessboard.com` |
| `GETPRO_PG_POOL_MAX` | Recommended | Default **5** (lower than before to reduce Supabase connection pressure) |
| `GETPRO_PG_CONNECT_TIMEOUT_MS` | Optional | Default 10000 — increase to 15000 if Supabase is slow |
| `GETPRO_PG_IDLE_MS` | Optional | Default 30000 |
| `GETPRO_PG_SSL` | If Supabase | `strict`, `no-verify`, or `off` |
| `NODE_ENV` | Recommended | `production` |

Never commit secrets. Set in Hostinger **Environment variables** panel.

### Supabase / connection pressure

If public church sites return **503 temporarily unavailable** during deploy or restart:

1. Check Supabase connection limits (use **pooler** URL if available).
2. Set `GETPRO_PG_POOL_MAX=5` (default) — avoid raising above 10 on Hostinger multi-worker setups.
3. Only one worker runs heavy bootstrap at a time (PostgreSQL advisory lock).
4. Verify `https://blessboard.com/admin/diagnostics` — **Demo branch lookup** should be **Yes** when healthy.

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

**Required migrations through:** `090_church_operational_readiness.sql`

| Migration | Purpose |
|-----------|---------|
| `049`–`088` | Church core, auth, content, HQ/branch admin |
| `089_church_sermons_resources.sql` | Sermons and resources tables |
| `090_church_operational_readiness.sql` | `member_registration_enabled`, `church_public_contact_submissions` |

To verify manually after deploy:

```bash
# On server with DATABASE_URL set
node -e "require('./src/db/pg/ensureChurchSchema').ensureChurchSchema(require('./src/db/pg').getPgPool()).then(()=>console.log('ok')).catch(console.error)"
```

Latest church migrations include `089_church_sermons_resources.sql` (sermons/resources tables) and **`090_church_operational_readiness.sql`** (member registration flag + contact submissions).

---

## Pilot church provisioning (Kafue Baptist)

Do **not** add Kafue Baptist to production seed. Provision via BlessBoard platform admin only:

1. `https://blessboard.com/admin/login` (super admin)
2. `https://blessboard.com/admin/churches/new`
3. Organization name: **Kafue Baptist Church**
4. Branch host slug: **`kafuebaptist`**
5. City: **Kafue**, Country: **Zambia**
6. Branch admin + HQ admin credentials
7. Check **Publish starter website content**
8. Submit → copy welcome handoff from `https://blessboard.com/admin/churches/:id`
9. Run [blessboard-pilot-smoke-test.md](./blessboard-pilot-smoke-test.md) pilot section

Full form guide: [blessboard-church-onboarding.md](./blessboard-church-onboarding.md#example-add-kafuebaptistblessboardcom)

---

## New Church Smoke Test

After onboarding **`kafuebaptist`** (or any new slug), run this checklist:

| Step | URL / action | Expected |
|------|----------------|----------|
| 1 | `https://kafuebaptist.blessboard.com` | Public homepage loads |
| 2 | `/about` | About/mission content from website editor |
| 3 | `/contact` | Contact form + church details |
| 4 | Submit contact form | Success message; appears in branch admin **Contact submissions** |
| 5 | `/register` | Member registration form (if enabled) |
| 6 | Submit member registration | Redirect to `/registration-submitted`; pending in branch admin queue |
| 7 | `/branch/login` | Branch admin login works |
| 8 | `/branch/member-verification` | Pending member visible |
| 9 | `/branch/sermons` → add sermon | Saves and can publish |
| 10 | `/branch/resources` → add resource | Saves and can publish |
| 11 | Public `/sermons` and `/about` | Updated content visible |
| 12 | `https://getproapp.org` | GetPro platform unchanged |

### Automated smoke subset

```bash
npm test -- tests/church-operational-readiness.test.js tests/church-onboarding.test.js tests/church-blessboard-subdomains.test.js
```

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
| `https://blessboard.com/admin/login` | BlessBoard platform admin login |
| `https://blessboard.com/admin/churches/new` | New church provisioning |
| `https://blessboard.com/admin/churches/:id/edit` | Edit church details (org + primary branch subdomain/contact/registration) |
| `https://blessboard.com/admin/diagnostics` | Production diagnostics (super admin) |
| `https://getproapp.org/admin/church/organizations/new` | Redirects to blessboard.com/admin/churches/new |
| `https://getproapp.org/admin/church/organizations/:id/edit` | Redirects to blessboard.com/admin/churches/:id/edit |
| `https://unknownslug.blessboard.com` | Church not found (404) |

---

## Onboarding a new church

See [blessboard-church-onboarding.md](./blessboard-church-onboarding.md).

Quick steps:

1. `https://blessboard.com/admin/churches/new`
2. Set branch host slug (e.g. `kafuebaptist`)
3. Provision → test `https://kafuebaptist.blessboard.com`
4. Edit organization/subdomain/contact at `https://blessboard.com/admin/churches/:id/edit` (use branch website editor for public content)

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

- [blessboard-pilot-smoke-test.md](./blessboard-pilot-smoke-test.md)
- [blessboard-branch-admin-training.md](./blessboard-branch-admin-training.md)
- [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)
- [blessboard-content-management.md](./blessboard-content-management.md)
- [blessboard-screen-implementation-status.md](./blessboard-screen-implementation-status.md)
