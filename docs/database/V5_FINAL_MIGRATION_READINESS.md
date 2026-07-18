# BlessBoard V5 final migration readiness audit

**Audit date:** 2026-07-18  
**Auditor:** automated readiness pass against repo + local suites  
**Hosted rehearsal / cutover:** **not executed**  
**Local fixture rehearsal:** PASS (`npm run migrate:v4-to-v5:rehearsal`)

---

## Verdict

# READY WITH MANUAL CONDITIONS

Not **READY**: hosted dry-run/apply against production-shaped databases has not occurred.  
Not **NOT READY**: schema, local tests, migration tooling, V4 isolation, and cutover documentation are in place with **37/37** named V5/migration suites green.

Cutover may proceed **only** after every manual condition below is closed or explicitly waived in the sign-off table of `docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md`.

---

## 1. Audit matrix

| Area | Status | Evidence / notes |
|------|--------|------------------|
| Schema completeness | **PASS (V5 scope)** | Platform + BlessBoard migrations through `025_*`, plans `013_*`, audit `012_*`. GetPro/NGO empty shells. Not a full clone of all 129 V4 `church_*` tables (by design). |
| Migration checksums | **PASS (local)** | `test:db:foundation` / bootstrap + migrator checksum ledger. Hosted `db:status` still required. |
| Identity safety | **PASS (code+tests)** | `DATABASE_IDENTITY_EXPECTED`; refuse overwrite; migration tooling verifies target before writes. |
| Source/target separation | **PASS** | Explicit `V4_SOURCE_*` / `V5_TARGET_*`; same fingerprint refused; no `DATABASE_URL` fallback in migrator. |
| V5 routes | **PASS (tests)** | Foundation server mounts public, member, HQ, branch-admin, platform-admin, content, media, reports, forms, giving, attendance, announcements, participation. |
| Auth / session / CSRF | **PASS (tests)** | Host-only cookies; apex↔tenant transfer; CSRF on POSTs; rate limits on login. |
| Tenant routing | **PASS** | `off` → `shadow` → `authoritative`; never inferred from `NODE_ENV`. |
| Authorization | **PASS** | UUID-scoped roles; fail-closed admin routes; public landings fail-soft. |
| Public pages | **PASS** | Published-only; authoritative mode gated. |
| Admin modules | **PASS** | HQ / branch / platform / content / registrations / ops modules covered by suites. |
| Member modules | **PASS** | Registration + portal + announcements/participation/forms member paths. |
| Reports | **PASS** | HQ operational reports + audit list; entitlement soft tier. |
| Media | **PASS (metadata)** | Upload/serve tested; **hosted blob copy from V4 deferred**. |
| Entitlements | **PASS** | Central service; fail-closed writes; no destructive downgrade. |
| Migration tooling | **PASS** | plan / dry-run / apply / verify + local rehearsal. |
| Reconciliation | **PASS (local)** | Fixture count table PASS; hosted reconciliation pending. |
| Rollback | **DOCUMENTED** | Routing off + V4 restore; no V5→V4 reverse-write; 4h window. |
| V4 isolation | **PASS** | Separate DB; no `public.tenants`/`session` on V5; legacy plans unused by V5 entitlements. |
| Documentation | **PASS** | Mapping, rehearsal, hosted cutover runbook, architecture, implementation status. |
| Hostinger settings | **DOCUMENTED** | Foundation env template; must keep `GETPRO_DATABASE_URL` unset. |
| DNS assumptions | **DOCUMENTED** | Canonical `*.blessboard.org`; custom domains entitlement-gated. |
| Test discovery | **PASS** | Named npm scripts; 37 suites executed this audit. |
| Dependency vulnerabilities | **CONDITIONAL** | Prod: multer + path-to-regexp (high); qs/postcss (moderate). Dev tooling: vite/ws. See §3. |

---

## 2. Critical blockers

None that fail **local** readiness. The following are **hard stops before hosted go**:

| ID | Blocker | Why |
|----|---------|-----|
| H1 | **No hosted migration rehearsal** | Policy: cannot claim READY without hosted dry-run/apply against intended V5 project using sanitized/real counts. |
| H2 | **Open mapping product decisions** | Invalid without written answers/waivers (see cutover §8 / conditions M4–M12). |
| H3 | **Media blob migration path incomplete** | Metadata-only; binaries not copied — public/admin media may 404 post-cutover if files expected. |

---

## 3. Manual conditions (complete list)

All must be **Done** or **Waived (signer + date)** before authoritative production cutover.

| ID | Condition |
|----|-----------|
| M1 | Hosted V5 foundation bootstrap + `db:verify:foundation` on **intended** Supabase project |
| M2 | Hosted **dry-run** with `V4_SOURCE_DATABASE_URL` / `V5_TARGET_DATABASE_URL` / `DATABASE_IDENTITY_EXPECTED` (read-only source) |
| M3 | Hosted **apply** in maintenance window with `--confirm`, then verify + reconciliation signed off |
| M4 | Decide `data_environment` default for missing V4 values |
| M5 | Synthetic email policy for username-only admins |
| M6 | HQ branch synthesis when none exists |
| M7 | Canonical hostname suffix + custom-domain entitlement handling |
| M8 | Member `rejected` mapping + password invite-reset vs hash copy |
| M9 | HQ broadcasts → announcements vs drop |
| M10 | Giving settings: strip payment secrets vs quarantine |
| M11 | Ministry leader accounts (unsupported as V5 staff roles) |
| M12 | Audit migrate volume / append-only implications |
| M13 | Media blob copy + checksum verify into Supabase Storage (or waive “no historical media”) |
| M14 | Scope remaining V4 domains (pastoral, groups, billing, surveys, …) as Phase 2 / out-of-scope waiver |
| M15 | Named cutover roles filled (lead, DB, deploy, DNS, rollback, comms, QA) |
| M16 | V4 + V5 backups verified within 24h of window |
| M17 | DNS inventory + TTL plan + reversal owners |
| M18 | Hostinger V5 env reviewed: no `GETPRO_DATABASE_URL`; routing starts `off` |
| M19 | `DEPLOYMENT_ENV=testing` foundation mode accepted for go-live week **or** promotion plan approved |
| M20 | Dependency triage: upgrade **multer** / **path-to-regexp** (via Express) before exposing upload-heavy traffic, or accept risk in writing |
| M21 | Customer communication + status page prepared |
| M22 | Rollback owner drills routing-off + V4 restore (tabletop) |
| M23 | Sign-off table completed in `V5_HOSTED_MIGRATION_AND_CUTOVER.md` |

---

## 4. Tests (this audit)

Executed 2026-07-18 locally. **37 passed, 0 failed.**

| Suite | Result |
|-------|--------|
| `test:db:foundation` | PASS |
| `test:db:bootstrap-foundation` | PASS |
| `test:platform:resolution` | PASS |
| `test:platform:http-context` | PASS |
| `test:platform:host-comparison` | PASS |
| `test:platform:provisioning` | PASS |
| `test:platform:entitlements` | PASS |
| `test:platform:diagnostic-integration` | PASS |
| `test:platform:sessions` | PASS |
| `test:v5:foundation-startup` | PASS |
| `test:migration:mapping` | PASS |
| `test:migration:tooling` | PASS |
| `test:blessboard:catalogue` | PASS |
| `test:blessboard:http-context` | PASS |
| `test:blessboard:provisioning` | PASS |
| `test:blessboard:auth-schema` | PASS |
| `test:blessboard:auth` | PASS |
| `test:blessboard:tenant-routing` | PASS |
| `test:blessboard:authorization` | PASS |
| `test:blessboard:branch-admin-shell` | PASS |
| `test:blessboard:hq-shell` | PASS |
| `test:blessboard:platform-admin-shell` | PASS |
| `test:blessboard:tenant-auth` | PASS |
| `test:blessboard:settings` | PASS |
| `test:blessboard:public-content-schema` | PASS |
| `test:blessboard:public-pages` | PASS |
| `test:blessboard:content-admin` | PASS |
| `test:blessboard:media` | PASS |
| `test:blessboard:members-schema` | PASS |
| `test:blessboard:member-registration` | PASS |
| `test:blessboard:member-portal` | PASS |
| `test:blessboard:announcements` | PASS |
| `test:blessboard:participation` | PASS |
| `test:blessboard:attendance` | PASS |
| `test:blessboard:giving` | PASS |
| `test:blessboard:forms-requests` | PASS |
| `test:blessboard:reports-audit` | PASS |
| `migrate:v4-to-v5:rehearsal` (local) | PASS |

---

## 5. Security confirmation

| Control | Confirmed |
|---------|-----------|
| Host-only session cookies (no shared Domain) | Yes (tests + architecture) |
| CSRF on state-changing POSTs | Yes |
| Auth transfer single-use / short TTL | Yes |
| Login rate limiting | Yes |
| Fail-closed admin authorization | Yes |
| Public pages soft on entitlement/auth errors | Yes |
| Audit metadata redaction | Yes |
| Migrator never prints credentials | Yes |
| Source read-only; no source mutation | Yes |
| No `public.tenants` / `public.session` on V5 | Yes |
| Entitlement fail-closed for premium writes | Yes |

**Residual risk:** npm audit high on **multer** (V5 content upload path) and **path-to-regexp** (Express 5). Treat as M20.

---

## 6. Data reconciliation confirmation

| Scope | Status |
|-------|--------|
| Local fixture reconciliation (eligible vs migrated) | **PASS** — see `V4_TO_V5_MIGRATION_REHEARSAL.md` |
| Idempotent second apply | **PASS** (written=0) |
| Batch rollback rehearsal | **PASS** |
| Hosted source→target reconciliation | **PENDING** (M2–M3) |

Unexpected quarantine is a **stop**; expected quarantines (invalid keys, missing contact) must match the signed mapping policy.

---

## 7. V4 isolation

| Check | Status |
|-------|--------|
| V5 uses separate foundation DB only | Yes |
| V5 does not load `server.legacy.js` when foundation mode active | Yes |
| V4 `churchPlans` / legacy session store unused by V5 entitlements | Yes |
| Migration does not reverse-write to V4 | Yes |
| Cutover rollback restores V4 app/DNS; does not sync V5→V4 | Documented |

---

## 8. Exact hosted commands (placeholders only)

```bash
cd /path/to/getpro
git checkout <GIT_TAG_OR_SHA>

# --- V5 foundation (once per project) ---
export DATABASE_URL='postgresql://USER:PASSWORD@V5_HOST:PORT/postgres'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
export DATABASE_IDENTITY_ENV='production'   # or approved pilot

npm run db:migrate
npm run db:identity:check
npm run db:verify:foundation
npm run db:status

# --- Migration (explicit URLs; never DATABASE_URL fallback) ---
export V4_SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@V4_HOST:PORT/V4_DB'
export V5_TARGET_DATABASE_URL='postgresql://USER:PASSWORD@V5_HOST:PORT/V5_DB'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
export V4_TO_V5_OUTPUT_DIR='/path/to/artifacts/migration-final'
export V4_TO_V5_CANONICAL_DOMAIN_SUFFIX='blessboard.org'
export V4_TO_V5_DEPLOYMENT_CODE='blessboard-org-v5'
export V4_TO_V5_DATA_ENVIRONMENT='production'
export V4_TO_V5_BATCH_SIZE='50'

npm run migrate:v4-to-v5:plan
npm run migrate:v4-to-v5:dry-run
# review conflict-report.json + skipped-record-report.json

npm run migrate:v4-to-v5:apply -- --confirm
npm run migrate:v4-to-v5:verify

# idempotency proof
npm run migrate:v4-to-v5:apply -- --confirm
```

---

## 9. Exact SQL verification

```sql
-- Identity
SELECT identity_key, environment_code, database_name, host_fingerprint
FROM platform.database_identity WHERE id = 1;

-- Forbidden legacy public tables must be absent
SELECT to_regclass('public.tenants') AS public_tenants,
       to_regclass('public.session') AS public_session;

-- Core counts (compare to frozen V4 eligible totals)
SELECT 'organizations' AS e, COUNT(*)::bigint AS n FROM platform.organizations
UNION ALL SELECT 'churches', COUNT(*) FROM blessboard.churches
UNION ALL SELECT 'branches', COUNT(*) FROM blessboard.branches
UNION ALL SELECT 'domains', COUNT(*) FROM platform.domains
UNION ALL SELECT 'users', COUNT(*) FROM blessboard.users
UNION ALL SELECT 'members', COUNT(*) FROM blessboard.members
UNION ALL SELECT 'subscriptions', COUNT(*) FROM platform.organization_subscriptions
WHERE status IN ('active','trialing','past_due');

-- One known tenant shape
SELECT o.organization_key, c.church_key, b.branch_key, b.branch_type, b.is_primary, d.hostname
FROM platform.organizations o
JOIN blessboard.churches c ON c.organization_id = o.id
JOIN blessboard.branches b ON b.church_id = c.id
LEFT JOIN platform.domains d ON d.organization_id = o.id AND d.status = 'active'
WHERE o.organization_key = '<organization_key>'
ORDER BY b.branch_type, b.branch_key;
```

---

## 10. Exact curl smoke tests (expected status codes)

Assume Hostinger V5 is up; replace hostnames.

```bash
# Routing OFF
# Hostinger: BLESSBOARD_TENANT_ROUTING_MODE=off

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/
# expect 200 (foundation)

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/login
# expect 200

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/
# expect 200 foundation HTML (not tenant content)

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/login
# expect 503 (tenant login unavailable while foundation/off) OR controlled transfer path per current build —
# confirm against deployed build notes; do not proceed if 5xx unhandled.

# Shadow
# BLESSBOARD_TENANT_ROUTING_MODE=shadow
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/
# expect 200 foundation HTML; logs contain blessboard_tenant_route_shadow

# Authoritative
# BLESSBOARD_TENANT_ROUTING_MODE=authoritative
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/
# expect 200 tenant landing

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/about
# expect 200 or 404 if page unpublished (controlled)

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' https://blessboard.org/
# expect 404 or 503 (controlled; generic body)

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200 always
```

Browser smoke: apex login → `/account`; tenant `/login` → transfer → `/hq` or `/branch-admin`; member portal; published public pages only.

---

## 11. Exact rollback commands

```bash
# 1) Fastest: disable tenant content on V5 (Hostinger env + restart)
BLESSBOARD_TENANT_ROUTING_MODE=off
BLESSBOARD_JOBS_ENABLED=0

# 2) Restore V4 Hostinger deployment to last known-good release
# (panel redeploy / previous package — no V5→V4 data sync)

# 3) DNS reversal per inventory (wait for TTL)

# 4) Confirm V5 no longer serves tenant pages
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant>.blessboard.org' https://blessboard.org/
# expect foundation / non-tenant behavior

# 5) Preserve V5 DB as artifact — do not DROP
```

**Max rollback window:** 4 hours after authoritative enable (unless waiver).

---

## 12. Environment checklist (Hostinger V5)

```bash
NODE_ENV=production
DEPLOYMENT_ENV=testing
DATABASE_URL=<V5_ONLY>
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
PLATFORM_HOST_CONTEXT_MODE=diagnostic
BLESSBOARD_TENANT_ROUTING_MODE=off          # then shadow → authoritative
BLESSBOARD_JOBS_ENABLED=0
SESSION_SECRET=<≥32 chars>
SESSION_COOKIE_NAME=blessboard_org_v5_sid
BASE_DOMAIN=blessboard.org
PUBLIC_SCHEME=https
BLESSBOARD_APEX_ORIGIN=https://blessboard.org
BLESSBOARD_CANONICAL_DOMAIN=blessboard.org
BLESSBOARD_APEX_DOMAINS=blessboard.org,www.blessboard.org
CHURCH_HOST_DOMAIN=blessboard.org
```

**Unset:** `GETPRO_DATABASE_URL`  
**Do not** set cookie `Domain=.blessboard.org`

---

## 13. Post-cutover monitoring checklist

| Window | Check |
|--------|-------|
| 0–15 min | `/healthz` 200; apex login; one tenant landing |
| 15–60 min | 5xx rate; auth transfer errors; shadow/authoritative log anomalies |
| 1–4 h | Support inbox; giving/attendance sample totals; entitlement denials |
| 4 h | Rollback window decision: stay on V5 or abort |
| 24–72 h | DNS propagation; custom domains; media 404 rate; job flags if re-enabled |

---

## 14. Suggested commit sequence

If landing this audit + prior migration work as commits:

1. `Document V5 final migration readiness audit` (this file + status pointer)  
2. (If not already committed) migration tooling + rehearsal + cutover runbook as separate commits per prior messages  

Do **not** mix dependency upgrades with the audit commit unless M20 is executed intentionally.

---

## 15. Final operator action

1. Open `docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md`.  
2. Assign named owners; schedule window.  
3. Close or waive **M1–M23**.  
4. Execute hosted dry-run → apply → verify **only** after G1–G9 go.  
5. Promote routing `off` → `shadow` → `authoritative` with smoke + monitor.  
6. Keep this audit verdict as **READY WITH MANUAL CONDITIONS** until M1–M3 are done — then re-issue a short addendum changing verdict to **READY** (or **NOT READY** if hosted reconciliation fails).

---

## Document control

| Field | Value |
|-------|--------|
| Verdict | READY WITH MANUAL CONDITIONS |
| Local suites | 37/37 PASS |
| Local rehearsal | PASS |
| Hosted rehearsal | NOT DONE |
| Features added in this audit | None |
