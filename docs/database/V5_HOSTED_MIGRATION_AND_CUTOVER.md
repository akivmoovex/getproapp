# V5 hosted migration and cutover runbook

**Status:** documentation only — **do not execute** from this file without an approved change window and signed go/no-go.  
**Authority companions:**

- `docs/database/V4_TO_V5_DATA_MAPPING.md`
- `docs/database/V4_TO_V5_MIGRATION_REHEARSAL.md`
- `docs/database/HOSTED_SUPABASE_RUNBOOK.md`
- `docs/database/ARCHITECTURE.md`

**Hard rules**

- Never print full connection strings, passwords, or session secrets in tickets, chat, or logs.
- Never reverse-write V5 data back into V4.
- Never create `public.tenants` / `public.session` on the V5 database.
- Never point the V5 Hostinger app at the legacy V4 database (`GETPRO_DATABASE_URL` must stay unset for V5).
- `BLESSBOARD_TENANT_ROUTING_MODE` is never inferred from `NODE_ENV` or hostname — set it explicitly.
- Local rehearsal (`npm run migrate:v4-to-v5:rehearsal`) is **not** a substitute for this hosted cutover.

---

## 1. Roles and ownership

| Role | Responsibility | Named owner (fill at cutover) |
|------|----------------|-------------------------------|
| **Cutover lead** | Sequence control, go/no-go calls | `________________` |
| **DB operator** | Backups, migration apply/verify, fingerprints | `________________` |
| **App/deploy operator** | Hostinger env, deploy, routing flags | `________________` |
| **DNS owner** | Inventory, TTL, reversal | `________________` |
| **Rollback owner** | Execute rollback section if aborted | `________________` |
| **Comms owner** | Status page / stakeholder messages | `________________` |
| **QA / smoke** | Public, member, admin checks | `________________` |

---

## 2. Preconditions (must all pass before freeze)

### 2.1 Backups

- [ ] **V4 (legacy) Postgres:** full logical dump + restore test sample completed within 24h of window.
- [ ] **V5 (hosted Supabase):** snapshot / PITR point recorded; confirm project ID matches intended target.
- [ ] Artifact locations recorded (bucket/path placeholders only — no credentials):

```text
V4_BACKUP_URI=s3://…/v4/<YYYY-MM-DD>/…
V5_SNAPSHOT_ID=<supabase-or-host-snapshot-id>
BACKUP_VERIFIED_BY=________________
BACKUP_VERIFIED_AT=<ISO-8601>
```

### 2.2 Maintenance window

| Field | Value |
|-------|--------|
| Window start (UTC) | `<YYYY-MM-DDThh:mm:ssZ>` |
| Window end (UTC) | `<YYYY-MM-DDThh:mm:ssZ>` |
| Max rollback window | **≤ 4 hours** after authoritative routing enable (see §6) |
| V4 write freeze method | App maintenance flag / read-only DB role / deploy pause (pick one and document) |
| V5 write freeze method | **`BLESSBOARD_WRITE_MAINTENANCE=1`** on V5 Hostinger (see [`V5_MAINTENANCE_MODE_DESIGN.md`](../operations/V5_MAINTENANCE_MODE_DESIGN.md)); restart all workers; confirm `/healthz` shows `"writeMaintenance":true` |
| Stakeholder notice sent | ☐ |

### 2.3 Source / target fingerprints

Record **safe** summaries only (host fingerprint + database name + SHA-256 prefix). Never paste full URLs.

```bash
# Operator workstation — placeholders only
export V4_SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@V4_HOST:PORT/V4_DB'
export V5_TARGET_DATABASE_URL='postgresql://USER:PASSWORD@V5_HOST:PORT/V5_DB'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'

# Refuse same fingerprint (tooling must error if equal)
node -e "
const { connectionFingerprint, safeConnectionSummary } = require('./src/migration/v4ToV5/config');
const a = process.env.V4_SOURCE_DATABASE_URL;
const b = process.env.V5_TARGET_DATABASE_URL;
const fa = connectionFingerprint(a);
const fb = connectionFingerprint(b);
if (!fa || !fb || fa === fb) { console.error(JSON.stringify({ ok:false, code:'same_or_bad_fingerprint' })); process.exit(1); }
console.log(JSON.stringify({
  ok: true,
  source: safeConnectionSummary(a, 'v4_source'),
  target: safeConnectionSummary(b, 'v5_target')
}, null, 2));
"
```

Record outputs:

| | Host fingerprint | DB name | Fingerprint SHA prefix |
|--|------------------|---------|------------------------|
| V4 source | | | |
| V5 target | | | |

**Stop if** source and target fingerprints match.

### 2.4 Target identity

V5 foundation must already be migrated and identity-initialized (see `HOSTED_SUPABASE_RUNBOOK.md`).

```bash
export DATABASE_URL='<V5_TARGET_DATABASE_URL>'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
# production cutover identity environment:
export DATABASE_IDENTITY_ENV='production'

npm run db:identity:check
npm run db:verify:foundation
npm run db:status
```

**Expected**

- `identity_key` = `blessboard-platform-v5`
- `environment_code` = `production` (or explicitly approved `pilot` for a staged cutover — do not mix)
- `to_regclass('public.tenants')` and `public.session` are **null**
- Checksums clean; no unexpected product tables

**Stop if** identity mismatch, checksum drift, or forbidden `public` tables.

### 2.5 DNS inventory

Fill before freeze (example rows):

| Hostname | Current target (V4/V5/CDN) | TTL | Owner | Cutover action | Reversal plan |
|----------|----------------------------|-----|-------|----------------|---------------|
| `blessboard.org` | | | | Apex → V5 Hostinger | Point back to V4 app |
| `www.blessboard.org` | | | | | |
| `<tenant>.blessboard.org` | | | | Canonical → V5 | |
| Custom domains (if any) | | | | Only if entitled + verified | |

Lower TTLs (e.g. 300s) at least **24h** before freeze when possible.

### 2.6 Hostinger variables (V5 app)

Set on the **V5** Hostinger application only. Placeholders:

```bash
NODE_ENV=production
DEPLOYMENT_ENV=testing
# Keep DEPLOYMENT_ENV=testing until foundation cutover is complete and product owners approve
# promoting out of foundation mode. Do NOT omit PLATFORM_DEPLOYMENT_CODE.

DATABASE_URL=<V5_SUPABASE_URL>
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
PLATFORM_HOST_CONTEXT_MODE=diagnostic
BLESSBOARD_TENANT_ROUTING_MODE=off
BLESSBOARD_JOBS_ENABLED=0
BLESSBOARD_MEDIA_UPLOADS_ENABLED=0
# Keep write maintenance OFF until Step 1b / migrate apply window:
# BLESSBOARD_WRITE_MAINTENANCE=0

SESSION_SECRET=<≥32 chars>
SESSION_COOKIE_NAME=blessboard_org_v5_sid
BASE_DOMAIN=blessboard.org
PUBLIC_SCHEME=https
BLESSBOARD_APEX_ORIGIN=https://blessboard.org
BLESSBOARD_CANONICAL_DOMAIN=blessboard.org
BLESSBOARD_APEX_DOMAINS=blessboard.org,www.blessboard.org
CHURCH_HOST_DOMAIN=blessboard.org
BLESSBOARD_PUBLIC_URL=https://blessboard.org
BLESSBOARD_ADMIN_URL=https://blessboard.org
```

**Must remain unset on V5:** `GETPRO_DATABASE_URL`.  
**Must not** set session cookie `Domain=.blessboard.org`.

V4 Hostinger (legacy) keeps its own `DATABASE_URL` / `GETPRO_DATABASE_URL` pointing at the **legacy** DB until rollback window expires.

### 2.7 Local rehearsal gate

- [ ] Latest `npm run migrate:v4-to-v5:rehearsal` **PASS** on operator laptop (fixture DBs).
- [ ] Mapping decisions that affect production rows are documented and approved (see §8).

### 2.8 Communication plan

| Audience | Channel | Pre-freeze message | Freeze message | Complete / rollback message |
|----------|---------|--------------------|----------------|-----------------------------|
| Internal ops | | | | |
| Church HQ contacts (if customer-facing) | | | | |
| Status page | | | | |

Template placeholders:

```text
SUBJECT: BlessBoard maintenance <YYYY-MM-DD>
BODY: Writes paused from <START> to <END> UTC for platform upgrade.
Support: <CONTACT>. Status: <URL>.
```

---

## 3. Execution sequence

Work from a clean checkout of the approved release tag: `<GIT_TAG_OR_SHA>`.

### Step 1 — Freeze V4 writes

```bash
# Option A (preferred): put V4 Hostinger into maintenance / read-only mode
# (exact Hostinger UI or feature flag — document chosen method)

# Option B: revoke write grants for app role on V4 (DBA only)
# REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM <v4_app_role>;
```

- [ ] Confirm new member registrations / admin writes fail closed on V4.
- [ ] Record freeze timestamp: `<ISO-8601>`

### Step 1b — Freeze V5 writes (app write maintenance)

Before migrate **apply** against the V5 database while the V5 app is live:

```bash
# Hostinger V5 app — approved window only — then restart ALL workers:
BLESSBOARD_WRITE_MAINTENANCE=1
BLESSBOARD_JOBS_ENABLED=0
BLESSBOARD_MEDIA_UPLOADS_ENABLED=0
```

- [ ] `GET https://blessboard.org/healthz` → **200** with `"writeMaintenance":true` (no secrets in body).
- [ ] Spot-check: `POST /login` → **503** maintenance page; `GET /` and `GET /login` still **200**.
- [ ] Rollback (immediate): set `BLESSBOARD_WRITE_MAINTENANCE=0` (or unset), restart all workers; re-check healthz.

Do **not** leave write maintenance enabled outside the signed window.

### Step 2 — Record source counts

```bash
export V4_SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@V4_HOST:PORT/V4_DB'
# Use a read-only role when available.

psql "$V4_SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT 'church_organizations' AS entity, COUNT(*)::bigint AS n FROM public.church_organizations
UNION ALL SELECT 'church_branches', COUNT(*) FROM public.church_branches
UNION ALL SELECT 'church_members', COUNT(*) FROM public.church_members
UNION ALL SELECT 'church_hq_admins', COUNT(*) FROM public.church_hq_admins
UNION ALL SELECT 'church_branch_admins', COUNT(*) FROM public.church_branch_admins
UNION ALL SELECT 'church_announcements', COUNT(*) FROM public.church_announcements
UNION ALL SELECT 'church_attendance_records', COUNT(*) FROM public.church_attendance_records
UNION ALL SELECT 'church_giving_summaries', COUNT(*) FROM public.church_giving_summaries
ORDER BY 1;
" > "/path/to/artifacts/source-counts-<UTC>.txt"
```

Store the file with the change ticket. **Do not** dump PII tables to chat.

### Step 3 — Final dry-run

```bash
cd /path/to/getpro
git checkout <GIT_TAG_OR_SHA>

export V4_SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@V4_HOST:PORT/V4_DB'
export V5_TARGET_DATABASE_URL='postgresql://USER:PASSWORD@V5_HOST:PORT/V5_DB'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
export V4_TO_V5_OUTPUT_DIR='/path/to/artifacts/migration-final'
export V4_TO_V5_CANONICAL_DOMAIN_SUFFIX='blessboard.org'
export V4_TO_V5_DEPLOYMENT_CODE='blessboard-org-v5'
export V4_TO_V5_DATA_ENVIRONMENT='production'   # or approved pilot value
export V4_TO_V5_BATCH_SIZE='50'

npm run migrate:v4-to-v5:plan
npm run migrate:v4-to-v5:dry-run
```

Review:

- `migration-plan.json`
- `dry-run-summary.json`
- `conflict-report.json`
- `skipped-record-report.json`

### Step 4 — Resolve conflicts

- [ ] Every conflict has an owner decision: fix source / quarantine / abort.
- [ ] Expected quarantines match the approved mapping doc (invalid keys, missing contact, etc.).
- [ ] **No mapping-rule weakening** to force green results.

**Stop if** unresolved conflicts remain without signed waiver.

### Step 5 — Migration apply

```bash
# REQUIRES explicit confirmation flag
npm run migrate:v4-to-v5:apply -- --confirm
```

- [ ] Capture CLI JSON summary (counts only) into artifacts.
- [ ] Confirm source DB row counts unchanged vs Step 2 (no source mutation).

### Step 6 — Verify

```bash
npm run migrate:v4-to-v5:verify
```

```bash
export DATABASE_URL="$V5_TARGET_DATABASE_URL"
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
npm run db:identity:check
npm run db:verify:foundation
```

### Step 7 — Reconciliation

Compare Step 2 source counts to V5 aggregates (eligible vs migrated). Example shapes (placeholders):

```sql
-- V5 (run via Supabase SQL editor or psql against V5 only)
SELECT 'organizations' AS entity, COUNT(*) FROM platform.organizations
UNION ALL SELECT 'churches', COUNT(*) FROM blessboard.churches
UNION ALL SELECT 'branches', COUNT(*) FROM blessboard.branches
UNION ALL SELECT 'members', COUNT(*) FROM blessboard.members
UNION ALL SELECT 'domains', COUNT(*) FROM platform.domains;
```

Fill the reconciliation table:

| Entity | Source | Eligible | Migrated | Delta | Pass? |
|--------|--------|----------|----------|-------|-------|
| organizations | | | | | ☐ |
| churches | | | | | ☐ |
| branches | | | | | ☐ |
| members | | | | | ☐ |
| … | | | | | ☐ |

**Stop on any unexpected data loss or count mismatch.**

Optional second apply (idempotency proof):

```bash
npm run migrate:v4-to-v5:apply -- --confirm
# Expect written=0 (or only intentional new deltas); investigate otherwise.
```

### Step 8 — Deploy V5 with routing off

Deploy/restart Hostinger V5 app with:

```bash
BLESSBOARD_TENANT_ROUTING_MODE=off
PLATFORM_HOST_CONTEXT_MODE=diagnostic
BLESSBOARD_JOBS_ENABLED=0
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
DATABASE_URL=<V5_ONLY>
# GETPRO_DATABASE_URL unset
```

### Step 9 — Verify apex auth

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/
# expect 200 foundation HTML

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/login
# expect 200

# Browser: apex login → /account for a known migrated staff user
```

**Stop if** apex auth fails.

### Step 10 — Enable shadow routing

```bash
# Hostinger env change + restart
BLESSBOARD_TENANT_ROUTING_MODE=shadow
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/
# expect 200 foundation HTML (still no tenant browser content)
```

Inspect logs for `blessboard_tenant_route_shadow` (org/church/branch keys + deployment comparison). No UUIDs required in the report — keys only.

### Step 11 — Inspect known tenants

For each pilot hostname in the DNS inventory:

| Hostname | Shadow log OK | Org key | Church key | Primary branch | Notes |
|----------|---------------|---------|------------|----------------|-------|
| `<tenant>.blessboard.org` | ☐ | | | | |

**Stop if** any pilot tenant mis-resolves.

### Step 12 — Enable authoritative routing

```bash
BLESSBOARD_TENANT_ROUTING_MODE=authoritative
# Pilot: exact hosts only. Estate cutover: use explicit * after signed approval.
# BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=diagnostic.blessboard.org
# Empty allow-list fails closed (foundation only) — do not omit for estate traffic.
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/
# expect 200 tenant landing (church name present; no UUIDs)

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' https://blessboard.org/
# expect controlled 404/503
```

Record authoritative-enable timestamp: `<ISO-8601>` — **rollback clock starts here**.

### Step 13 — Smoke test public / member / admin modules

Checklist (pilot tenants):

| Module | Check | Pass |
|--------|-------|------|
| Public | `/`, `/about`, `/events`, `/contact` on tenant host | ☐ |
| Public | Unpublished content not visible | ☐ |
| Member | `/register` (if enabled) + member portal login path | ☐ |
| HQ | Tenant `/login` → apex transfer → `/hq` | ☐ |
| Branch admin | `/branch-admin` for assigned branch only | ☐ |
| Settings | HQ/branch settings load | ☐ |
| Content admin | Draft/publish still scoped | ☐ |
| Giving / attendance | Read aggregates match reconciliation sample | ☐ |
| Entitlements | Plan limits fail closed (e.g. custom domain on free) | ☐ |

### Step 14 — Monitor

Minimum **60–120 minutes** (extend for large estates):

- Error rate / 5xx on Hostinger
- `blessboard_tenant_route_*` anomalies
- Auth transfer failures
- Supabase CPU / connections
- Support inbox / status page

### Step 15 — Reopen writes

Only after Step 13–14 pass and go/no-go sign-off:

- [ ] Disable V4 maintenance / restore V4 to **read-only archive** or decommission path (do not dual-write).
- [ ] Confirm V5 is the system of record for migrated tenants.
- [ ] Announce completion.
- [ ] Keep V4 backups + frozen snapshot until rollback window ends.

---

## 4. Go / no-go checklist

| # | Gate | Go? |
|---|------|-----|
| G1 | Backups verified (V4 + V5) | ☐ |
| G2 | Fingerprints distinct; identity matches | ☐ |
| G3 | DNS inventory + lowered TTL complete | ☐ |
| G4 | Hostinger V5 env reviewed (no `GETPRO_DATABASE_URL`) | ☐ |
| G5 | Local rehearsal PASS | ☐ |
| G6 | V4 writes frozen | ☐ |
| G7 | Source counts recorded | ☐ |
| G8 | Final dry-run clean (or waivers signed) | ☐ |
| G9 | Apply + verify + reconciliation PASS | ☐ |
| G10 | Apex auth PASS with routing `off` | ☐ |
| G11 | Shadow pilot tenants PASS | ☐ |
| G12 | Authoritative smoke PASS | ☐ |
| G13 | Monitor window acceptable | ☐ |

**Any G1–G9 fail ⇒ abort before authoritative routing.**  
**Any G10–G12 fail ⇒ rollback (§5).**

---

## 5. Rollback

### Principles

- Prefer **routing off** first (fastest, no data movement).
- Restore **V4 deployment** as customer-facing system of record.
- Reverse DNS only where it was changed.
- **No reverse-writing from V5 → V4.**
- Quarantined / new V5-only rows created after cutover are **not** merged back automatically.

### Maximum rollback window

**Default: 4 hours** after Step 12 (authoritative enable).  
Beyond that window, treat rollback as a **new incident** (data divergence risk). Extend only with written approval from Cutover lead + Rollback owner.

### Rollback procedure

1. **Immediate:** set Hostinger V5

```bash
BLESSBOARD_TENANT_ROUTING_MODE=off
BLESSBOARD_JOBS_ENABLED=0
```

2. **Restore V4 app** to serve apex/tenant traffic (redeploy last known-good V4 release; ensure V4 DB is writable again if frozen via grants).

3. **DNS reversal** per inventory table (wait for TTL).

4. **Communicate** rollback message.

5. **Preserve** V5 database as forensic artifact — do not drop; do not sync to V4.

6. File incident: freeze timestamp, apply batch IDs, reconciliation deltas, who approved abort.

```bash
# Optional: confirm V5 no longer serves tenant content
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/
# expect foundation / non-tenant behavior with routing off
```

---

## 6. Sign-off table

| Gate / decision | Name | Role | Signature | UTC time |
|-----------------|------|------|-----------|----------|
| Preconditions complete | | Cutover lead | | |
| Go for V4 freeze | | Cutover lead | | |
| Go for migration apply | | DB operator + Cutover lead | | |
| Go for authoritative routing | | Cutover lead + App operator | | |
| Go for reopen writes | | Cutover lead | | |
| Abort / rollback executed | | Rollback owner | | |

---

## 7. Artifact checklist

Store under a ticket-controlled path (no secrets in git):

```text
/path/to/artifacts/cutover-<YYYY-MM-DD>/
  source-counts-*.txt
  fingerprints.json
  migration-plan.json
  dry-run-summary.json
  conflict-report.json
  skipped-record-report.json
  reconciliation-report.json
  apply-summary.json
  verify-summary.json
  smoke-checklist.md
  sign-off.md
```

---

## 8. Remaining blockers (resolve before hosted execute)

These are **product/ops decisions**, not command typos:

1. Default `data_environment` for rows missing V4 values.
2. Synthetic email policy for username-only admins.
3. HQ branch synthesis when none exists.
4. Canonical hostname suffix / custom-domain entitlement during import.
5. Member `rejected` status mapping and member password invite-reset policy.
6. HQ broadcasts → announcements vs drop.
7. Giving settings: strip payment secrets vs quarantine.
8. Ministry leader login accounts (unsupported in V5 roles today).
9. Audit migrate volume / append-only rollback implications.
10. Media blob copy path (storage buckets + checksum verify) — deferred in tooling.
11. Full coverage of remaining V4 `church_*` domains (pastoral, groups, billing, etc.).
12. Whether `DEPLOYMENT_ENV` stays `testing` (foundation mode) through first production week.

Until blockers are closed or waived in writing, hosted cutover remains **no-go**.

---

## 9. Related commands (reference)

| Command | Purpose |
|---------|---------|
| `npm run migrate:v4-to-v5:plan` | Plan JSON |
| `npm run migrate:v4-to-v5:dry-run` | No target writes |
| `npm run migrate:v4-to-v5:apply -- --confirm` | Bounded apply |
| `npm run migrate:v4-to-v5:verify` | Target verify + reconcile file |
| `npm run migrate:v4-to-v5:rehearsal` | Local fixture rehearsal only |
| `npm run db:migrate` / `db:verify:foundation` / `db:identity:check` | V5 foundation |

---

## 10. Document control

| Field | Value |
|-------|--------|
| Created | 2026-07-18 |
| Last updated | 2026-07-18 |
| Execution status | **Not executed** |
| Owner | Cutover lead (named at window) |
