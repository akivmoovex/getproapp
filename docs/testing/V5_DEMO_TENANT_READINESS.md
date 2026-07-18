# BlessBoard V5 — Demo tenant data readiness

**Date:** 2026-07-19
**Mode:** Read-only audit (no seed, migrate, or hosted data modification)
**Target database:** Hosted V5 foundation · `platform.database_identity.identity_key = blessboard-platform-v5` · `environment_code = testing`
**Target tenant:** `diagnostic-church` (sole `platform.organizations` row)
**Canonical hostname:** `diagnostic.blessboard.org`
**Expected deployment:** `blessboard-org-v5` (`active` / `testing`)

**Related:** [`HOSTED_SUPABASE_RUNBOOK.md`](../database/HOSTED_SUPABASE_RUNBOOK.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`V5_SHADOW_ROUTING_READINESS.md`](../deployment/V5_SHADOW_ROUTING_READINESS.md) · [`V5_GUI_PRODUCTION_SMOKE_TEST.md`](../ui/V5_GUI_PRODUCTION_SMOKE_TEST.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Catalogue shape ready for **shadow-routing validation**? | **YES** — organization, BlessBoard enrolment, church, HQ/primary branch, active canonical domain, and active `blessboard-org-v5` deployment are present and environment-compatible. |
| Ready for **full end-to-end GUI/role testing**? | **NO** — no users, no role assignments, no published Home/About, no operational sample rows. |

Do **not** use legacy `npm run church:seed-demos` for this gate. That path seeds `public.church_*` and depends on legacy `public.tenants`, which must stay absent on V5.

---

## 2. Audit method

1. Connected **read-only** to the configured hosted database (normalized a local duplicated `DATABASE_URL=` prefix **in memory only**; `.env` was not written).
2. Confirmed identity + forbidden legacy tables (`public.tenants`, `public.session`).
3. Confirmed tenant catalogue shape (org → product → church → branch → domain → deployment).
4. Counted users/roles/members/`public_pages`/module rows **without** selecting emails, passwords, cookies, or connection strings.
5. Confirmed local operator `.env` does **not** set `GETPRO_DATABASE_URL` (commented placeholder only). Hostinger V5 must keep it unset per cutover docs.

No invented remediation SQL. Remediation below uses existing npm scripts / documented UI workflows only.

---

## 3. Expected relationships (keys only)

```
organization_key = diagnostic-church (active, data_environment=testing)
  └─ organization_products: product_key=blessboard, product_tenant_key=diagnostic-church, status=active
  └─ church_key = diagnostic-church (active, data_environment=testing)
       └─ branch_key = hq (branch_type=hq, is_primary=true, status=active)
  └─ hostname = diagnostic.blessboard.org (canonical, primary, active)
       └─ deployment_id/code = blessboard-org-v5 (active, environment_code=testing)
```

Database identity (`blessboard-platform-v5` / `testing`) is the **physical DB purpose**, not the deployment code. Do not treat them as interchangeable.

---

## 4. Requirement matrix

Status legend: **READY** · **MISSING** · **INVALID** · **NOT REQUIRED**

| # | Requirement | Status | Evidence (safe identifiers only) |
|---|-------------|--------|----------------------------------|
| 1 | Platform organization exists | **READY** | `organization_key=diagnostic-church`, `status=active`, `data_environment=testing` |
| 2 | BlessBoard product enrolment active | **READY** | `product_key=blessboard`, `product_tenant_key=diagnostic-church`, `status=active` |
| 3 | BlessBoard church exists | **READY** | `church_key=diagnostic-church`, `status=active`, `data_environment=testing` |
| 4 | HQ branch exists | **READY** | `branch_key=hq`, `branch_type=hq`, `status=active` |
| 5 | Primary branch exists | **READY** | Same row: `hq` has `is_primary=true` |
| 6 | Domain mapping exists | **READY** | `hostname=diagnostic.blessboard.org`, `domain_type=canonical`, `status=active`, `is_primary=true` → `blessboard-org-v5` |
| 7 | Statuses / environments compatible | **READY** | Org, church, domain, and `blessboard-org-v5` all `active` / `testing`; identity `testing` |
| 8 | Member test user exists | **MISSING** | `blessboard.members` count `0`; primary active memberships `0`; `blessboard.users` count `0` |
| 9 | Branch-admin test user exists | **MISSING** | Active `branch_admin` roles for org: `0` |
| 10 | HQ-admin test user exists | **MISSING** | Active `church_hq_admin` roles for org: `0` |
| 11 | Platform-admin test user exists | **MISSING** | Active `platform_admin` roles (platform-wide): `0` |
| 12 | Role assignments active | **MISSING** | No active `blessboard.user_roles` rows for this org / platform admin |
| 13 | Published Home content | **MISSING** | No `blessboard.public_pages` row with `page_key=home` |
| 14 | Published About content | **MISSING** | No `blessboard.public_pages` row with `page_key=about` |
| 15 | Operational test content | **MISSING** | Module counts all `0`: announcements, events, ministries, sermons, resources, forms, member_requests, giving_methods, attendance_events |
| 16 | No dependency on `public.tenants` | **READY** | `to_regclass('public.tenants')` → `null` |
| 17 | No dependency on `public.session` | **READY** | `to_regclass('public.session')` → `null` |
| 18 | No dependency on `GETPRO_DATABASE_URL` | **READY** | Local `.env`: unset (commented placeholder only); process env unset during audit. Hostinger V5 must keep unset ([`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md)). |

### Notes on classifications

| Item | Classification note |
|------|---------------------|
| Separate campus primary ≠ HQ | **NOT REQUIRED** while `hq` is already `is_primary=true`. A second primary would be **INVALID**. |
| Legacy `church:seed-demos` / `demo` / `demo2` | **INVALID** for this V5 gate (wrong schema generation; conflicts with no `public.tenants`). |
| Honest empty CMS UI | UI may render empties, but smoke precondition P5 still expects published sample content for full E2E demos. |
| Invalid catalogue relationships | **None observed** on this tenant (no orphan church, no inactive enrolment with active domain, no domain→wrong deployment). |

---

## 5. Missing prerequisites (blocks full E2E)

1. At least one active `platform_admin` user (apex `/admin`).
2. Active `church_hq_admin` for `diagnostic-church`.
3. Active `branch_admin` scoped to `church_key=diagnostic-church` + `branch_key=hq`.
4. Active member with linked user + primary `member_branch_memberships` (`membership_status=active`, `is_primary=true`).
5. Published `public_pages` for `home` and `about`.
6. ≥1 safe published/operational row per module you intend to demo.

---

## 6. Safe remediation (existing tooling only)

Fix local operator env first (do **not** commit secrets):

- Ensure `DATABASE_URL` is a single `postgresql://…` value (no duplicated `DATABASE_URL=` prefix).
- Set `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5`.
- For V5 app/CLI context: `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, `DEPLOYMENT_ENV=testing`.
- Keep `GETPRO_DATABASE_URL` **unset**.

### 6.1 Confirm catalogue (idempotent; expect `already_provisioned`)

```bash
npm run platform:tenant:provision -- \
  --organization-key diagnostic-church \
  --display-name "BlessBoard Diagnostic Church" \
  --environment testing \
  --product blessboard \
  --tenant-key diagnostic-church \
  --hostname diagnostic.blessboard.org \
  --domain-type canonical \
  --deployment blessboard-org-v5

npm run blessboard:church:provision -- \
  --organization-key diagnostic-church \
  --church-key diagnostic-church \
  --display-name "BlessBoard Diagnostic Church" \
  --environment testing \
  --hq-branch-key hq \
  --hq-branch-name "Headquarters"
```

### 6.2 Create staff / platform users + roles

There is **no** V5 member-create CLI. Staff roles use:

```bash
# Platform admin (apex)
printf '%s' 'TEMP_PASSWORD' | npm run blessboard:user:create -- \
  --email platform.admin@example.org \
  --display-name 'Platform Admin' \
  --password-stdin

npm run blessboard:user:role:assign -- \
  --email platform.admin@example.org \
  --organization-key diagnostic-church \
  --role platform_admin

# HQ admin
printf '%s' 'TEMP_PASSWORD' | npm run blessboard:user:create -- \
  --email hq.admin@example.org \
  --display-name 'HQ Admin' \
  --password-stdin

npm run blessboard:user:role:assign -- \
  --email hq.admin@example.org \
  --organization-key diagnostic-church \
  --role church_hq_admin \
  --church-key diagnostic-church

# Branch admin (primary/HQ branch key)
printf '%s' 'TEMP_PASSWORD' | npm run blessboard:user:create -- \
  --email branch.admin@example.org \
  --display-name 'Branch Admin' \
  --password-stdin

npm run blessboard:user:role:assign -- \
  --email branch.admin@example.org \
  --organization-key diagnostic-church \
  --role branch_admin \
  --church-key diagnostic-church \
  --branch-key hq
```

Replace placeholder emails/passwords with operator-owned test credentials. Do not commit them.

### 6.3 Member test user

**No dedicated `blessboard:user` member seed.** After routing allows tenant registration:

1. Open `https://diagnostic.blessboard.org/register` (authoritative mode) **or** use registration once tenant public is reachable in the intended routing mode.
2. Approve/activate via branch-admin Registrations so an active `blessboard.members` row + primary `member_branch_memberships` exist.

Until then, member portal E2E remains blocked.

### 6.4 Published Home/About + operational samples

**No V5 content seed CLI / seed name** for CMS or modules.

1. Sign in via apex transfer → `/hq` or `/branch-admin`.
2. Publish `home` and `about` under content admin (`blessboard.public_pages`).
3. Create one safe published row each for modules you intend to demo via existing admin UIs.

Do not invent INSERT SQL for these tables.

### 6.5 Explicitly do not run

| Command / seed | Why |
|----------------|-----|
| `npm run church:seed-demos` | Legacy `public.church_*` + `public.tenants` path — **INVALID** for V5 |
| `npm run church:pilot:seed` / V4 demo seeds | Not V5 platform/blessboard catalogue |
| Ad-hoc invented INSERT SQL | Out of policy for this readiness gate |

---

## 7. Shadow-routing validation gate

From [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) Step 10:

```bash
# Hostinger env + restart (operators)
BLESSBOARD_TENANT_ROUTING_MODE=shadow
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/
# expect 200 foundation HTML (still no tenant browser content in shadow)
```

Inspect logs for `blessboard_tenant_route_shadow` with keys:

- organization: `diagnostic-church`
- church: `diagnostic-church`
- branch: `hq` (primary)
- deployment comparison against `blessboard-org-v5`

### Shadow decision

**Proceed to shadow-routing validation: YES.**

Catalogue resolution prerequisites are **READY**. Missing users/content block **authoritative full E2E / smoke P5–P6**, not shadow log validation.

---

## 8. Full E2E readiness checklist (remaining)

| Gate | Status |
|------|--------|
| Shadow routing on `diagnostic.blessboard.org` | Eligible now |
| Apex login + platform admin | Blocked until `platform_admin` user exists |
| HQ / branch admin portals | Blocked until role users exist |
| Member portal | Blocked until member + primary membership exist |
| Public CMS Home/About demo | Blocked until published pages exist |
| Operational module demos | Blocked until ≥1 safe published item per exercised module |

---

## 9. Operator env defects observed (local workspace)

These are configuration issues in the local `.env` used for this audit — **not** hosted data defects:

| Issue | Impact |
|-------|--------|
| `DATABASE_URL` value duplicated as `DATABASE_URL=DATABASE_URL=postgresql://…` | Naive pool parse fails until normalized in-process |
| `DATABASE_IDENTITY_EXPECTED` unset | `db:identity:check` / provision CLIs refuse |
| `PLATFORM_DEPLOYMENT_CODE` / `DEPLOYMENT_ENV` / `BLESSBOARD_TENANT_ROUTING_MODE` unset locally | Local app context is not a V5 testing runtime |

Hosted identity row itself is present and valid (`blessboard-platform-v5` / `testing`).
`GETPRO_DATABASE_URL` is correctly **unset** locally (commented placeholder only).

---

## 10. Suggested next operator actions (ordered)

1. Fix local `DATABASE_URL` + set `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5`; keep `GETPRO_DATABASE_URL` unset.
2. Run shadow routing against `diagnostic.blessboard.org` and capture `blessboard_tenant_route_shadow` logs.
3. Create platform / HQ / branch admin users via `blessboard:user:create` + `blessboard:user:role:assign`.
4. Publish Home/About + one operational sample each via admin UI.
5. Create/activate a member via registration workflow.
6. Only then enable `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` for full E2E smoke.
