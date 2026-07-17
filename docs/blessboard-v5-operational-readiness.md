# BlessBoard V5 operational readiness

Controlled **Foundation** and limited **Growth** pilot operations. No product-feature instructions.

**Last updated:** 2026-07-17  
**Companion docs:** [blessboard-production-checklist.md](./blessboard-production-checklist.md), [blessboard-staging-restoration-checklist.md](./blessboard-staging-restoration-checklist.md), [blessboard-pilot-smoke-test.md](./blessboard-pilot-smoke-test.md), [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)

**Automated gate (read-only):** `npm run church:pilot:readiness`

---

## A. Deployment runbook (V5)

Do **not** claim Hostinger UI labels beyond what operators already use. Steps marked **[Hostinger]** or **[Supabase]** are external.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Confirm branch/commit: `git fetch && git checkout <V5-branch> && git pull` then `git log -1 --oneline` | Expected SHA matches release notes |
| 2 | **Maintenance mode** | **Not implemented in-app.** Use **[Hostinger]** temporary downtime page / pause Node app, or DNS hold, if a write freeze is required. Document who approved the freeze. |
| 3 | Database identity | `DEPLOYMENT_ENV=testing\|production` matches `church_database_identity.environment_code`. Init once with `npm run church:db-identity:init -- --env <env> --confirm` (never overwrite). |
| 4 | Pre-deploy backup | **[Supabase/Hostinger provider]** confirm a successful backup/snapshot exists (see §B). Record attestation via diagnostics or `npm run church:backup-verify-record`. |
| 5 | Install / build | `npm ci` then `npm run build` | Assets present; no install errors |
| 6 | Apply migrations | App boot runs `ensureChurchSchema` (idempotent). Or start once against the target DB. | `npm run church:pilot:readiness` → `db.migration` / `db.tables` / `db.indexes` PASS; latest file currently `126_church_platform_support_access.sql` |
| 7 | Start web | **[Hostinger]** Restart Node app for blessboard.com (and getproapp.org if shared). | `/admin/diagnostics` or readiness command green for `db.reachable` |
| 8 | Start workers | Schedule cron entrypoints in §C (`BLESSBOARD_JOBS_ENABLED` not false). | Job logs show `ok: true` or intentional `skipped` |
| 9 | Diagnostics | `https://blessboard.com/admin/diagnostics` (super admin) + `npm run church:pilot:readiness` | No FAIL checks; review WARN |
| 10 | Smoke | [blessboard-pilot-smoke-test.md](./blessboard-pilot-smoke-test.md) + focused `npm run test:church:pilot-smoke` when DB available | Freeze + pilot rows |
| 11 | Promote | Remove maintenance hold; notify pilot owners | Public + admin hosts respond |
| 12 | Rollback app code | `git checkout <previous-SHA>` / redeploy previous release artifact; **do not** reverse-migrate unless DBA-approved. Re-run readiness. | Previous SHA serving; identity still matches env |

### Required environment (presence)

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` or `GETPRO_DATABASE_URL` | Never log the value |
| `SESSION_SECRET` | ≥ 32 characters |
| `DEPLOYMENT_ENV` | `testing` or `production` (policy mode) |
| `EXPECTED_DATABASE_ENV` | Optional; must match `DEPLOYMENT_ENV` when set |
| `CHURCH_HOST_DOMAIN` / apex domains | Defaults to blessboard.com family if unset |
| `BLESSBOARD_JOBS_ENABLED` | Default on; set `false` to disable cron workers only |
| `NODE_ENV` | `production` on live Hostinger apps |

---

## B. Backup and restore

**Proven in-repo:** operator-attested backup/restoration events (`church:backup-verify-record`, diagnostics UI), stale warning via `BLESSBOARD_BACKUP_STALE_DAYS` (default 7).  
**Not proven in-repo:** provider schedule, retention length, automatic dumps, or Hostinger/Supabase RPO/RTO.

| Topic | Guidance |
|-------|----------|
| Provider / mechanism | **[Supabase]** and/or **[Hostinger]** managed Postgres backups/snapshots — confirm in provider console |
| Frequency | **Human-approved** — document actual schedule from provider (placeholder until ops confirms) |
| Retention | **Human-approved** — document provider retention (placeholder) |
| Pre-deployment backup | Required before V5 promote; evidence id only (no secrets) |
| Restore-test | Follow [blessboard-staging-restoration-checklist.md](./blessboard-staging-restoration-checklist.md) into **staging only** |
| RPO / RTO | **Placeholders requiring human approval** — do not invent numbers here |
| Who may restore | Platform/DBA roles designated by ops lead; never restore over production without written approval |
| Identity after restore | On staging DB: `npm run church:db-identity:init` only if empty; then `npm run church:pilot:readiness` — identity must be `testing` for staging, never confuse with production |
| V4 vs V5 backup confusion | Label snapshots with env + date + git SHA; compare `church_database_identity.database_instance_id` and host fingerprint from readiness output; never attach a V4 production dump to a V5 testing app (or reverse) without identity check |

Attachments under `data/uploads/church/` are **not** covered by DB-only restore.

---

## C. Worker runbook

All listed scripts use `prepareBlessBoardJobPool` → PostgreSQL configured + `ensureChurchSchema` + **database identity gate** + `BLESSBOARD_JOBS_ENABLED` gate.

| Worker | Command | Suggested frequency | Identity gate | Org status / entitlement | Idempotency | Failure visibility | Safe rerun | Disabled |
|--------|---------|---------------------|---------------|--------------------------|-------------|--------------------|------------|----------|
| Scheduled broadcasts | `node scripts/run-church-scheduled-broadcast-jobs.js` | Every 1–5 min | Yes | Skips/pauses when org inactive or entitlement missing | `job_key` / delivery `idempotency_key` | Platform jobs UI + logs; delivery `failed` | Re-run script; duplicates become `duplicate_job` | `BLESSBOARD_JOBS_ENABLED=false` → exit 0 skipped |
| Scheduled reports | `node scripts/run-church-scheduled-report-jobs.js` | Every 1–5 min | Yes | Same | `job_key` / delivery keys | Platform jobs + report run status | Re-run safe | Same |
| Growth trials | `node scripts/run-church-growth-trial-jobs.js` | Daily (or hourly) | Yes | Growth-only lifecycle | Service-level idempotent | Logs + audit | Re-run safe | Same |
| Foundation dormancy | `node scripts/run-church-organization-dormancy-jobs.js` | Daily | Yes | Foundation only; Growth excluded | `job_key` | Logs + dormancy rows | Re-run safe; no data delete | Same |
| Pilot feature flags | `node scripts/run-church-pilot-feature-flag-jobs.js` | Hourly / daily | Yes | Expires flags past `ends_at` | Process-once per flag window | Logs | Re-run safe | Same |

Cron is configured **outside** this repo (**[Hostinger]** cron / external scheduler).

---

## D. Monitoring checklist

| Signal | Where / how |
|--------|-------------|
| Web health | Apex + demo/pilot hosts HTTP 200; `/admin/diagnostics` |
| Database identity mismatch | Startup fatal if `DEPLOYMENT_ENV` testing/production ≠ identity; readiness `db.identity` |
| Migration lag | Readiness `db.migration` / `db.tables` / `db.indexes`; diagnostics latest migration label |
| Failed jobs | Platform jobs UI; readiness `jobs.failed` (7d) |
| Paused entitlement jobs | Readiness `jobs.paused`; diagnostics growth paused counts |
| Login failures / lockouts | `/admin/church/security` |
| Quota blocks | Audit actions `platform_support_access_denied` / package quota audits; usage meters |
| Storage errors | Attachment audit `npm run church:attachments:audit`; upload failures in logs |
| Email / report delivery failures | Delivery rows `failed` / `skipped_quota`; job outcomes |
| Audit anomalies | HQ `/hq/audit` + platform audit; support-access history |

---

## E. Pilot church onboarding checklist

Per pilot organisation (Foundation or limited Growth):

- [ ] Package (`foundation` or `growth`) confirmed
- [ ] Country / `platform_tenant_id` (e.g. Zambia) correct
- [ ] Data environment labelled (production vs demo/test)
- [ ] Owner / HQ admin credentials handed off securely
- [ ] First branch host slug live (`<slug>.blessboard.com`)
- [ ] Primary + backup account managers assigned (`/admin/church/organizations/:id/account-managers`)
- [ ] Initial training scheduled ([blessboard-branch-admin-training.md](./blessboard-branch-admin-training.md))
- [ ] Public content reviewed (home/about/contact as applicable)
- [ ] Member registration test completed
- [ ] Suspension / emergency contact procedure documented for church + BlessBoard ops
- [ ] Backup confirmation recorded for the deploy window
- [ ] Support-access explained: redacted diagnostics vs approved time-limited entry; church-visible history at `/hq/support-access`

---

## F. Rollback (summary)

1. Redeploy previous known-good git SHA (app code).
2. Leave DB forward-compatible when possible (V5 migrations are additive/idempotent).
3. Re-verify identity + readiness.
4. Disable workers only via `BLESSBOARD_JOBS_ENABLED=false` if job side effects must pause.
5. Do **not** restore production from backup without §B authorization.

---

## G. Data cleanup (safe)

| Action | Command / notes |
|--------|-----------------|
| Demo reset | `npm run church:demo-reset` — demo only; confirm identity is not production if unsure |
| Sample seed cleanup | `npm run church:cleanup-kafue-sample` — only when intentionally removing sample pilot seed |
| Attachment orphans | `npm run church:attachments:audit` — report only unless followed by approved cleanup |
| Never | Bulk delete live pilot churches without written approval and backup evidence |

---

## H. Controlled pilot rehearsal (testing only)

Never runs against V4 production. Requires `DEPLOYMENT_ENV=testing`, testing database identity, `--pilot-id=…`, and `--confirm`.

```bash
# Seed Foundation + Growth synthetic tenants
DEPLOYMENT_ENV=testing DATABASE_URL=… npm run church:pilot:seed -- --pilot-id=v5r1 --confirm

# Rehearse operational flows (no real email)
DEPLOYMENT_ENV=testing DATABASE_URL=… npm run church:pilot:rehearse -- --pilot-id=v5r1 --confirm

# Compact report (re-runs rehearsal report path)
DEPLOYMENT_ENV=testing DATABASE_URL=… npm run church:pilot:report -- --pilot-id=v5r1 --confirm

# Preview then delete only that pilot id
DEPLOYMENT_ENV=testing DATABASE_URL=… npm run church:pilot:cleanup -- --pilot-id=v5r1 --preview
DEPLOYMENT_ENV=testing DATABASE_URL=… npm run church:pilot:cleanup -- --pilot-id=v5r1 --confirm
```

Markers: `data_environment=pilot`, `plan_notes=controlled-pilot:<id>`, `@example.test` emails.
