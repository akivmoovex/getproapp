# BlessBoard V5 — Demo tenant readiness

**Date:** 2026-07-18  
**Mode:** Read-only audit (no seed, migrate, or data modification)  
**Target database:** Hosted V5 foundation identified as `platform.database_identity.identity_key = blessboard-platform-v5` (`environment_code = testing`)  
**Target tenant:** `diagnostic-church` (only `platform.organizations` row present)  
**Canonical hostname:** `diagnostic.blessboard.org`

**Related:** [`HOSTED_SUPABASE_RUNBOOK.md`](../database/HOSTED_SUPABASE_RUNBOOK.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`V5_GUI_PRODUCTION_SMOKE_TEST.md`](../ui/V5_GUI_PRODUCTION_SMOKE_TEST.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Catalogue shape ready for **shadow-routing validation**? | **YES** — organization, BlessBoard enrolment, church, HQ/primary branch, active domain, and active `blessboard-org-v5` deployment are present. |
| Ready for **full end-to-end GUI/role testing**? | **NO** — no active test users (member / branch admin / HQ admin / platform admin), no published Home/About pages, and no operational sample rows. |

Do **not** use legacy `npm run church:seed-demos` for this gate. That path seeds `public.church_*` and depends on legacy `public.tenants`, which must stay absent on V5.

---

## 2. Audit method

1. Connected read-only to the configured hosted database (after normalizing a malformed local `DATABASE_URL` env value that was prefixed twice as `DATABASE_URL=DATABASE_URL=…`; `.env` was not written).
2. Confirmed identity + forbidden legacy tables using the checks already documented in [`V5_FINAL_MIGRATION_READINESS.md`](../database/V5_FINAL_MIGRATION_READINESS.md).
3. Confirmed tenant shape using the verify-one-church pattern from [`HOSTED_SUPABASE_RUNBOOK.md`](../database/HOSTED_SUPABASE_RUNBOOK.md).
4. Inspected roles, members, `blessboard.public_pages`, and module row counts without inserting or updating anything.

No invented remediation SQL. Remediation commands below are existing npm scripts / documented UI workflows only.

---

## 3. Requirement matrix

Status legend: **READY** · **MISSING** · **INVALID** · **NOT REQUIRED**

| # | Requirement | Status | Evidence (keys only) |
|---|-------------|--------|----------------------|
| 1 | Platform organization | **READY** | `organization_key=diagnostic-church`, `status=active`, `data_environment=testing` |
| 2 | Active BlessBoard product enrolment | **READY** | `product_key=blessboard`, `product_tenant_key=diagnostic-church`, `enrolment_status=active` |
| 3 | BlessBoard church | **READY** | `church_key=diagnostic-church`, `status=active` |
| 4 | HQ branch | **READY** | `branch_key=hq`, `branch_type=hq`, `status=active` |
| 5 | Primary branch | **READY** | Same row: `hq` has `is_primary=true` (HQ may be primary per architecture) |
| 6 | Active domain mapping | **READY** | `hostname=diagnostic.blessboard.org`, `domain_type=canonical`, `status=active`, `is_primary=true`; deployment `blessboard-org-v5` is `active` / `testing` |
| 7 | Active test user — member | **MISSING** | `blessboard.members` empty for this church; no primary membership |
| 8 | Active test user — branch admin | **MISSING** | No `user_roles` with `role_key=branch_admin` for this org |
| 9 | Active test user — HQ admin | **MISSING** | No `user_roles` with `role_key=church_hq_admin` for this org |
| 10 | Active test user — platform admin | **MISSING** | No active `platform_admin` roles found |
| 11 | Published Home/About content | **MISSING** | `blessboard.public_pages` empty for this church (`home` / `about` absent) |
| 12 | ≥1 safe test item in operational modules | **MISSING** | Counts all `0`: announcements, events, ministries, sermons, resources, forms, member_requests, giving_methods, attendance_events |
| 13 | No `public.tenants` dependency | **READY** | `to_regclass('public.tenants')` → `null` |
| 14 | No `public.session` dependency | **READY** | `to_regclass('public.session')` → `null` |

### Notes on statuses

- **Separate campus primary ≠ HQ:** **NOT REQUIRED** when HQ is already `is_primary=true` (current shape). Adding a second primary would be **INVALID**.
- **Legacy catalogue seeds (`demo` / `demo2` via `church:seed-demos`):** **INVALID** for this V5 readiness gate (wrong schema generation; conflicts with “no `public.tenants`”).
- **Published content empty states:** UI can render honest empties, but smoke-test precondition P5 in [`V5_GUI_PRODUCTION_SMOKE_TEST.md`](../ui/V5_GUI_PRODUCTION_SMOKE_TEST.md) still expects published sample content before full E2E.

---

## 4. Safe remediation (existing tooling only)

Fix local operator env first (do not commit secrets):

- Ensure `DATABASE_URL` is a single `postgresql://…` value (no duplicated `DATABASE_URL=` prefix).
- Set `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5`.
- For V5 app/CLI context: `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, `DEPLOYMENT_ENV=testing`.

### 4.1 Confirm catalogue (idempotent; expect `already_provisioned`)

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

### 4.2 Create staff / platform users + roles

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

### 4.3 Member test user

**No dedicated `blessboard:user` member seed.** After routing allows tenant registration:

1. Open `https://diagnostic.blessboard.org/register` (authoritative mode) **or** use registration once tenant public is reachable in the intended routing mode.
2. Approve/activate via branch-admin Registrations so an active `blessboard.members` row + primary `member_branch_memberships` exist.

Until then, member portal E2E remains blocked.

### 4.4 Published Home/About + operational samples

**No V5 content seed CLI.** After HQ/branch admin users exist:

1. Sign in via apex transfer → `/hq` or `/branch-admin`.
2. Publish `home` and `about` under content admin (`blessboard.public_pages` / sections).
3. Create one safe published row each for modules you intend to demo (announcement, event, ministry, sermon, resource, form, giving method, attendance event) via existing admin UIs.

Do not invent INSERT SQL for these tables.

### 4.5 Explicitly do not run

| Command / seed | Why |
|----------------|-----|
| `npm run church:seed-demos` | Legacy `public.church_*` + `public.tenants` path |
| `npm run church:pilot:seed` / V4 demo seeds | Not V5 platform/blessboard catalogue |
| Ad-hoc invented INSERT SQL | Out of policy for this readiness gate |

---

## 5. Shadow-routing validation gate

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

## 6. Full E2E readiness checklist (remaining)

| Gate | Status |
|------|--------|
| Shadow routing on `diagnostic.blessboard.org` | Eligible now |
| Apex login + platform admin | Blocked until `platform_admin` user exists |
| HQ / branch admin portals | Blocked until role users exist |
| Member portal | Blocked until member + primary membership exist |
| Public CMS Home/About demo | Blocked until published pages exist |
| Operational module demos | Blocked until ≥1 safe published item per exercised module |

---

## 7. Operator env defects observed (local workspace)

These are configuration issues in the local `.env` used for this audit — **not** hosted data defects:

| Issue | Impact |
|-------|--------|
| `DATABASE_URL` value duplicated as `DATABASE_URL=DATABASE_URL=postgresql://…` | Naive pool parse fails until normalized in-process |
| `DATABASE_IDENTITY_EXPECTED` unset | `db:identity:check` / provision CLIs refuse |
| `PLATFORM_DEPLOYMENT_CODE` / `DEPLOYMENT_ENV` / `BLESSBOARD_TENANT_ROUTING_MODE` unset locally | Local app context is not a V5 testing runtime |

Hosted identity row itself is present and valid (`blessboard-platform-v5` / `testing`).

---

## 8. Suggested next operator actions (ordered)

1. Fix local `DATABASE_URL` + set `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5`.
2. Run shadow routing against `diagnostic.blessboard.org` and capture `blessboard_tenant_route_shadow` logs.
3. Create platform / HQ / branch admin users via `blessboard:user:create` + `blessboard:user:role:assign`.
4. Publish Home/About + one operational sample each via admin UI.
5. Create/activate a member via registration workflow.
6. Only then enable `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` for full E2E smoke.
