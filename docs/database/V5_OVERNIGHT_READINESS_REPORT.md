# BlessBoard V5 overnight readiness report

**Date:** 2026-07-18  
**Branch:** `V5`  
**Scope:** Security, regression, and hosted-rollout readiness for work completed overnight (tenant routing → authorization → branch-admin → HQ → platform-admin).  
**Constraint:** No new product features; minimal defect fixes only; no hosted Supabase access, deploy, push, DNS, or credential rotation.

---

## Overall verdict

**Ready for conservative hosted rollout with tenant routing left `off`, then shadow, then authoritative only after manual review.**

Named readiness suites all passed. V4 isolation holds (`server.legacy.js` unchanged; V5 gated by `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` + `DEPLOYMENT_ENV=testing`). Remaining blockers are operational (migrate + first admin user on Hostinger) and product (tenant-host login before HQ/branch-admin work in real browsers).

---

## Completed phases (tonight + foundation)

| Phase | Status |
|-------|--------|
| Platform foundation + identity + migrations | Done (prior) |
| Platform hostname resolution + diagnostics | Done (prior) |
| BlessBoard catalogue + church provisioning | Done (prior) |
| V5 sessions + apex auth (CSRF, hashed tokens) | Done (prior) |
| Feature-flagged tenant routing (`off` / `shadow` / `authoritative`) | Done |
| Tenant-scoped authorization (UUID roles) | Done |
| Minimal branch-admin shell | Done |
| Minimal HQ shell + branch selector | Done |
| Minimal apex platform-admin org directory | Done |
| Overnight security / readiness audit | Done (this report) |

---

## Architecture summary

V5 boots via `server.js` → `startV5FoundationServer` when foundation mode is active. Middleware order:

1. Static / cookies / URL-encoded body  
2. Platform host context (+ forced diagnostic when tenant routing needs resolution)  
3. BlessBoard catalogue context  
4. Tenant-routing decision (attach + shadow logs; no response)  
5. V5 session loader (`platform.deployment_sessions`)  
6. Authorization context loader (fail-soft; never blocks public routes alone)  
7. Routes: `/healthz`, `/tenant-access-check`, `/admin*`, `/hq*`, `/branch-admin*`, apex auth, `/`  
8. Controlled unavailable fallback  

Tenant identity comes from **hostname → platform domains → organization → BlessBoard church/branch**, never from URL slugs alone. Authorization compares **UUIDs**. Cookies are **host-only** (no `Domain=.blessboard.org`).

---

## Tables used (V5 path)

| Schema.table | Use |
|--------------|-----|
| `platform.deployments` | Deployment identity |
| `platform.organizations` | Shared org identity |
| `platform.organization_products` | BlessBoard enrolment |
| `platform.domains` | Hostname → org/deployment |
| `platform.deployment_sessions` | Session rows (token **hash** only) |
| `platform.database_identity` / `schema_migrations` | Foundation verify |
| `blessboard.churches` | Church catalogue |
| `blessboard.branches` | Branch catalogue + HQ list |
| `blessboard.users` | Login identity |
| `blessboard.user_roles` | Scoped roles |

**Not used on V5:** `public.tenants`, `public.session`, `connect-pg-simple`, legacy `church_*` ensure-schema path.

---

## Routes added / exposed on V5 foundation

| Route | Host | Auth |
|-------|------|------|
| `GET /healthz` | any | public |
| `GET /` | apex / tenant | public (tenant landing only when authoritative) |
| `GET/POST /login`, `POST /logout`, `GET /account` | apex | CSRF on mutating |
| `GET /tenant-access-check` | tenant | require tenant role |
| `GET /branch-admin`, `/branch-admin/account` | tenant | branch/HQ/platform roles |
| `POST /branch-admin/logout` | tenant | CSRF |
| `GET /hq`, `/hq/branches`, `/hq/branches/:branchKey` | tenant | HQ/platform |
| `GET /admin`, `/admin/organizations`, `/admin/organizations/:organizationKey` | apex | `platform_admin` |

---

## Environment variables (Hostinger / V5)

| Variable | Required value / note |
|----------|------------------------|
| `PLATFORM_DEPLOYMENT_CODE` | `blessboard-org-v5` |
| `DEPLOYMENT_ENV` | `testing` |
| `DATABASE_URL` | New platform DB only |
| `GETPRO_DATABASE_URL` | **Unset / ignored** on V5 |
| `SESSION_SECRET` | Required for CSRF HMAC |
| `SESSION_COOKIE_NAME` | Prefer `blessboard_org_v5_sid` |
| `BLESSBOARD_TENANT_ROUTING_MODE` | Start `off` |
| `PLATFORM_HOST_CONTEXT_MODE` | `diagnostic` recommended while shadowing |
| `DATABASE_IDENTITY_EXPECTED` | `blessboard-platform-v5` |
| `DATABASE_IDENTITY_ENV` | `testing` |
| `TRUST_PROXY` | Hostinger: leave default (`1`) unless debugging |
| `NODE_ENV` | `production` on Hostinger |

---

## Test results (2026-07-18)

### Named readiness suites — all pass

| Suite | Result |
|-------|--------|
| `npm run test:db:foundation` | pass (16) |
| `npm run test:db:bootstrap-foundation` | pass (9) |
| `npm run test:platform:resolution` | pass (25) |
| `npm run test:platform:http-context` | pass (22) |
| `npm run test:platform:host-comparison` | pass (24) |
| `npm run test:platform:provisioning` | pass (19) |
| `npm run test:blessboard:catalogue` | pass (12) |
| `npm run test:blessboard:provisioning` | pass (12) |
| `npm run test:blessboard:http-context` | pass (24) |
| `npm run test:blessboard:auth-schema` | pass (4) |
| `npm run test:blessboard:auth` | pass (9) |
| `npm run test:platform:sessions` | pass (3) |
| `npm run test:blessboard:tenant-routing` | pass (44) |
| `npm run test:blessboard:authorization` | pass (16) |
| `npm run test:blessboard:branch-admin-shell` | pass (11) |
| `npm run test:blessboard:hq-shell` | pass (6) |
| `npm run test:blessboard:platform-admin-shell` | pass (6) |
| `npm run test:v5:foundation-startup` | pass (13) |
| `npm run test:platform:diagnostic-integration` | pass (1) |

### Other checks

| Check | Result |
|-------|--------|
| `git diff --check` | clean |
| `npm audit --omit=dev` | 6 known vulns (multer, path-to-regexp, postcss, qs, vite) — **not auto-upgraded** (major risk; pre-existing; none introduced by overnight V5 shells) |
| `npm test` (full tree) | **Not a clean readiness gate.** Parallel ephemeral DB create races (`pg_database_datname_index` duplicate) caused ~183 failures while named suites with `--test-concurrency=1` pass. Do not weaken tests to green the full tree. |

---

## Security confirmations (checklist 1–20)

| # | Check | Result |
|---|-------|--------|
| 1 | No `public.tenants` in V5 code | **Pass** (`src/blessboard`, `src/platform/http` V5 path) |
| 2 | No `public.session` in V5 | **Pass** |
| 3 | No `connect-pg-simple` on V5 | **Pass** |
| 4 | V5 does not use `GETPRO_DATABASE_URL` | **Pass** (`getDatabaseUrl` + org isolation gate) |
| 5 | No runtime migration / schema creation | **Pass** |
| 6 | Raw session tokens never stored | **Pass** (`session_token_hash` only) |
| 7 | Passwords / hashes never logged | **Pass** |
| 8 | CSRF required for login/logout | **Pass** |
| 9 | Logout remains POST | **Pass** (apex + branch-admin) |
| 10 | Cookies host-only | **Pass** (no `domain` option) |
| 11 | No `Domain=.blessboard.org` | **Pass** |
| 12 | Tenant authz uses UUIDs | **Pass** |
| 13 | Tenant identity not from slugs alone | **Pass** (hostname resolution) |
| 14 | Forwarded-host uses trust proxy | **Pass** (`resolveHostname`) |
| 15 | Unknown / mismatched domains fail safe | **Pass** (controlled unavailable / 404) |
| 16 | DB errors do not crash health/public | **Pass** (try/catch + 503 patterns) |
| 17 | Admin templates expose no UUIDs/secrets | **Pass** (keys + display names) |
| 18 | No raw DB rows to templates | **Pass** (mapped DTOs) |
| 19 | No fake metrics / sample data | **Pass** (counts from DB; placeholders say Not enabled) |
| 20 | V4 startup/routing unchanged | **Pass** (`server.legacy.js` not modified) |

---

## Findings

### High-risk

*None confirmed in overnight V5 code.*

### Medium-risk

1. **Tenant-host session gap (known product blocker).** Apex host-only cookies do not reach tenant hosts, so `/hq` and `/branch-admin` cannot work in a real browser until tenant-host login exists. Do **not** fix with `Domain=.blessboard.org`.  
2. **Authoritative mode is irreversible-in-effect for UX.** Mis-set `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` shows tenant landing on live hostnames — keep `off` until shadow logs match.  
3. **`npm audit` production deps** (multer / path-to-regexp / vite / qs / postcss). Pre-existing; review separately; do not blind major bumps for this rollout.

### Low-risk

1. **Hardcoded apex URLs** (`blessboard.org` / `https://blessboard.org/`) in a few V5 helpers — acceptable for current V5 foundation; prefer config later.  
2. **Controlled HTML error pages** previously interpolated messages without escaping — **fixed** in HQ / branch-admin / platform-admin helpers during this audit (messages were static; defense-in-depth).  
3. **ARCHITECTURE.md drift** claiming HQ/branch still fully unavailable — **fixed** in this audit.  
4. **Full `npm test` parallelism** races ephemeral databases — operational test-runner limitation, not a product defect.  
5. **Duplicate `escapeHtml` helpers** across route modules — acceptable for now; share later if desired.

---

## Known limitations

- No tenant-host login / session handoff.  
- No org CRUD, billing, impersonation, password reset, MFA.  
- HQ/branch shells are placeholders (no operational modules).  
- Platform-admin is read-only directory only.  
- Shadow logs skip health/static but still require operator log access on Hostinger.  
- V5 foundation mode is intentionally temporary (`DEPLOYMENT_ENV=testing` gate).

---

## Hosted rollout checklist (conservative)

1. Review `git diff` on branch `V5`.  
2. Commit each logical phase separately (see suggested sequence below).  
3. Push `V5` (operator action — not done in this audit).  
4. Run migrations **only if** pending: `npm run db:migrate`.  
5. `npm run db:status`  
6. `npm run db:identity:check`  
7. `npm run db:verify:foundation`  
8. Deploy with `BLESSBOARD_TENANT_ROUTING_MODE=off`.  
9. Verify `/healthz`, apex `/`, `/login`, `/account`, `/logout`.  
10. Enable `shadow`; hit a known tenant hostname; review `blessboard_tenant_route_shadow` logs.  
11. Test one known provisioned tenant hostname.  
12. Review logs for mismatches / 5xx.  
13. Enable `authoritative` **only manually** after shadow matches.  
14. Verify apex `/admin*` after platform_admin login.  
15. On any mismatch: set mode back to `off` (no migration required).

---

## Exact operator commands

```bash
# Local readiness (named suites)
npm run test:db:foundation
npm run test:db:bootstrap-foundation
npm run test:platform:resolution
npm run test:platform:http-context
npm run test:platform:host-comparison
npm run test:platform:provisioning
npm run test:blessboard:catalogue
npm run test:blessboard:provisioning
npm run test:blessboard:http-context
npm run test:blessboard:auth-schema
npm run test:blessboard:auth
npm run test:platform:sessions
npm run test:blessboard:tenant-routing
npm run test:blessboard:authorization
npm run test:blessboard:branch-admin-shell
npm run test:blessboard:hq-shell
npm run test:blessboard:platform-admin-shell
npm run test:v5:foundation-startup
npm run test:platform:diagnostic-integration

# Hosted DB (after DATABASE_URL points at platform DB)
export DATABASE_URL='postgresql://…'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
export DATABASE_IDENTITY_ENV='testing'

npm run db:migrate
npm run db:status
npm run db:identity:check
npm run db:verify:foundation

# First platform admin (operator-run; never at startup)
printf '%s' 'TEMP_PASSWORD' | npm run blessboard:user:create -- \
  --email admin@example.org --display-name 'Administrator' --password-stdin

npm run blessboard:user:role:assign -- \
  --email admin@example.org \
  --organization-key example-church \
  --role platform_admin
```

---

## Rollback checklist

1. Set `BLESSBOARD_TENANT_ROUTING_MODE=off` on Hostinger and restart.  
2. If needed, redeploy previous commit on `V5` / prior release tag.  
3. Do **not** drop foundation tables as a first response.  
4. Do **not** point `DATABASE_URL` at the legacy V4 database.  
5. Do **not** set `Domain=.blessboard.org` on cookies.  
6. Leave V4 / `blessboard.com` on legacy path untouched.

---

## Hostinger environment checklist

- [ ] `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`  
- [ ] `DEPLOYMENT_ENV=testing`  
- [ ] `DATABASE_URL` = new platform Supabase/Postgres (not legacy)  
- [ ] `GETPRO_DATABASE_URL` unset  
- [ ] `SESSION_SECRET` set and stable across workers  
- [ ] `SESSION_COOKIE_NAME=blessboard_org_v5_sid`  
- [ ] `BLESSBOARD_TENANT_ROUTING_MODE=off` (initial)  
- [ ] `PLATFORM_HOST_CONTEXT_MODE=diagnostic`  
- [ ] `DATABASE_IDENTITY_EXPECTED` / `DATABASE_IDENTITY_ENV` match identity row  
- [ ] `NODE_ENV=production`  
- [ ] Proxy / LiteSpeed forwards `X-Forwarded-Host` correctly  
- [ ] Same env injected for **every** Node worker  

---

## Manual checks required

1. Apex login → account → logout (CSRF) in a real browser.  
2. Confirm session cookie has **no** Domain attribute in DevTools.  
3. Hit unknown hostname → controlled unavailable (not stack trace).  
4. With routing `off`, known tenant hostname still unavailable for tenant landing.  
5. With `shadow`, logs show expected org/church/branch; browser still foundation HTML.  
6. Platform-admin directory after `platform_admin` login; HQ/branch roles get 403.  
7. Confirm V4 `blessboard.com` still boots `server.legacy.js` when foundation env is absent.  
8. Operator review of pending migrations before `db:migrate` on hosted.

---

## Suggested commit sequence

1. **Foundation / identity / bootstrap** (if still uncommitted from earlier work).  
2. **Platform resolution + HTTP context + provisioning**.  
3. **BlessBoard catalogue + church provisioning**.  
4. **V5 sessions + apex auth**.  
5. **Tenant routing mode + landing**.  
6. **Tenant authorization**.  
7. **Branch-admin shell**.  
8. **HQ shell**.  
9. **Platform-admin shell**.  
10. **Docs + overnight readiness report** (this file + ARCHITECTURE/STATUS/RUNBOOK).

Do not commit `.env` or hosted credentials.

---

## Recommended next development phase

**Tenant-host login** with host-only cookies (no shared parent Domain), then the first real read-only HQ or branch module. Still defer: org CRUD, billing, impersonation, member registration, giving, CMS.

---

## Files changed during this audit

- `docs/database/V5_OVERNIGHT_READINESS_REPORT.md` (created)  
- `docs/database/ARCHITECTURE.md` (HQ/branch availability drift corrected)  
- `src/blessboard/http/hqAdminRoutes.js` (escape HTML in controlled errors)  
- `src/blessboard/http/branchAdminRoutes.js` (escape HTML in controlled errors)  
- `src/platform/http/platformAdminRoutes.js` (escape HTML in controlled errors)  

Overnight product work (already in tree, not authored solely by this audit) remains uncommitted pending operator commit sequence.
