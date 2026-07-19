# BlessBoard V5 — Demo tenant remediation plan

**Date:** 2026-07-19  
**Mode:** Documentation only — **do not execute** commands from this plan without a separate operator order  
**Source audit:** [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md)  
**Smoke companion:** [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md)  
**Release blockers:** [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) **B02–B04**

**Target (keys only)**

| Key | Value |
|-----|-------|
| Organization | `diagnostic-church` |
| Church | `diagnostic-church` |
| HQ / primary branch | `hq` |
| Hostname | `diagnostic.blessboard.org` |
| Deployment | `blessboard-org-v5` |
| DB identity | `blessboard-platform-v5` / `testing` |
| Apex | `https://blessboard.org` |

**Hard rules**

- Use **only** existing npm CLIs, documented UI workflows, or approved migrations (migrations are **out of scope** for this demo remediation).
- **Do not invent SQL.**
- **Do not** run `church:seed-demos`, `church:pilot:seed`, or any V4 demo seed against V5.
- **Do not** commit passwords or real emails.
- Every **hosted write** requires explicit operator confirmation (see §0).
- This document does **not** authorize routing flips (`shadow` / `authoritative`).

---

## 0. Hosted-write confirmation gate

Before any command or UI action that writes to the **hosted** V5 database, the operator must:

1. Confirm `DATABASE_URL` points at the intended V5 project (identity `blessboard-platform-v5`).
2. Confirm `GETPRO_DATABASE_URL` is **unset**.
3. Record: operator name, timestamp, step ID from this plan.
4. Type confirmation: `CONFIRM HOSTED WRITE <step-id>` (e.g. `CONFIRM HOSTED WRITE U-PA`).

Local/testing foundation DBs may use the same CLI templates **without** that phrase, but must still use `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5` (or the local foundation identity your ephemeral DB was initialized with).

---

## 1. Audit summary — what needs remediation?

| Readiness # | Item | Status (audit) | Remediation class |
|-------------|------|----------------|-------------------|
| 1 | Platform organization | **READY** | Verify only |
| 2 | BlessBoard product enrolment | **READY** | Verify only |
| 3 | BlessBoard church | **READY** | Verify only |
| 4 | HQ branch | **READY** | Verify only |
| 5 | Primary branch | **READY** | Verify only |
| 6 | Domain mapping | **READY** | Verify only |
| 7 | Status / environment consistency | **READY** | Verify only |
| 8 | Member test user + primary membership | **MISSING** | **Remediate** |
| 9 | Branch-admin test user | **MISSING** | **Remediate** |
| 10 | HQ-admin test user | **MISSING** | **Remediate** |
| 11 | Platform-admin test user | **MISSING** | **Remediate** |
| 12 | Role assignments active | **MISSING** | **Remediate** |
| 13 | Published Home (`public_pages`) | **MISSING** | **Remediate** |
| 14 | Published About | **MISSING** | **Remediate** |
| 15 | Operational sample content | **MISSING** | **Remediate** |
| — | Media library sample (for smoke T18–T19) | **MISSING** (implied by module/media zeros) | **Remediate** |
| 16–18 | No `public.tenants` / `public.session` / `GETPRO_DATABASE_URL` | **READY** | Verify only — never “fix” by creating legacy tables |
| — | Legacy `church:seed-demos` path | **INVALID** for V5 | **Do not run** |

**Platform deployment** (`blessboard-org-v5`) and **product catalogue enrolment** were READY in the audit; they appear below as verify-first rows so operators do not skip them before writes.

---

## 2. Local / testing vs hosted

| Context | When to use | Writes |
|---------|-------------|--------|
| **Local foundation** | Rehearse CLI arg shapes against ephemeral `blessboard_ft_*` or local foundation DB | Allowed on local DB only; never point `DATABASE_URL` at hosted for “practice” without confirmation |
| **Hosted testing** | Close B02–B04 on Supabase V5 (`testing`) | **Confirmation gate §0** on every write |
| **Hostinger env / routing** | Shadow / authoritative | **Out of scope** — use shadow / authoritative runbooks separately |

Shared env prerequisites for CLIs (both contexts):

```bash
# Do not paste real secrets into tickets or commits.
export DATABASE_URL='postgresql://…'   # single URL; no duplicated DATABASE_URL= prefix
export DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5
# Keep GETPRO_DATABASE_URL unset
```

Read-only preflight (safe; no write):

```bash
npm run db:identity:check
npm run db:status
npm run db:verify:foundation
```

---

## 3. Verify-only items (READY — no write if still READY)

Re-check before creating users. If any fail, stop and escalate — do **not** invent SQL.

| Item | Required state | Existing tool | Command template | Writes data | Verification |
|------|----------------|---------------|------------------|-------------|--------------|
| Platform deployment | `blessboard-org-v5` active / `testing` | Seed/bootstrap history + PA UI; **no** dedicated “create deployment” demo CLI | Hosted: open Apex `/admin/deployments` (PA) or read-only `db:status` / identity docs. Local: foundation bootstrap already seeded deployments via approved migrate+seed path — **do not** re-run hosted migrate for this plan. | No (verify) | PA deployment detail shows `blessboard-org-v5` · `active` · `testing` |
| Product record / enrolment | `organization_products` active for `blessboard` / `diagnostic-church` | Covered by `platform:tenant:provision` (idempotent) | See §4 row “Organization + enrolment + domain” — expect `already_provisioned` | Only if provision re-run needed | PA org detail shows BlessBoard product active |
| Organization | `diagnostic-church` active / `testing` | `platform:tenant:provision` | Same | Idempotent re-run only | Org key + status match |
| Domain | `diagnostic.blessboard.org` canonical primary → `blessboard-org-v5` | `platform:tenant:provision` | Same | Idempotent re-run only | PA domains / Host resolution |
| Church | `diagnostic-church` active / `testing` | `blessboard:church:provision` | See §4 | Idempotent re-run only | Catalogue / PA org branches |
| HQ branch | `hq`, `branch_type=hq`, active | `blessboard:church:provision` | Same | Idempotent re-run only | Branch key `hq` |
| Primary branch | Same `hq` with `is_primary=true` | `blessboard:church:provision` | Same | Idempotent re-run only | Exactly one primary; do **not** add a second primary |
| Status / environment consistency | Org, church, domain, deployment all `active` + `testing`; identity `testing` | Read-only checks + PA | `npm run db:identity:check` | No | All environments match; no `production` data_environment on this tenant |
| No legacy tables | `public.tenants` / `public.session` absent | Read-only | Documented in smoke T31 / readiness §4 | No | `to_regclass` null (ops verify; no SQL invented here) |
| No GetPro attach | `GETPRO_DATABASE_URL` unset on V5 host + local | Env inspection | Hostinger panel / local `.env` | No | Key absent |

### Catalogue re-confirm (idempotent; hosted write only if confirmation given)

Dry-run is the **default** for provision CLIs. Preview first (no write), then add `--confirm` for writes. Requires `DATABASE_IDENTITY_EXPECTED` match, unset `GETPRO_DATABASE_URL`, and `--deployment` (or resolvable org domain deployment for church).

If catalogue rows were somehow missing, operators may re-run provision. On current audit they should print **already provisioned** / `dry_run_already_provisioned` and not expand the graph incorrectly.

**Hosted confirmation ID:** `CAT-RECONFIRM`

| Item | Required state | Existing tool | Command template | Writes data | Verification |
|------|----------------|---------------|------------------|-------------|--------------|
| Organization + product enrolment + domain | Same keys as readiness §3 | `npm run platform:tenant:provision` | ```bash<br># Preview (default dry-run)<br>npm run platform:tenant:provision -- \<br>  --organization-key diagnostic-church \<br>  --display-name "BlessBoard Diagnostic Church" \<br>  --environment testing \<br>  --product blessboard \<br>  --tenant-key diagnostic-church \<br>  --hostname diagnostic.blessboard.org \<br>  --domain-type canonical \<br>  --deployment blessboard-org-v5<br># Write<br>npm run platform:tenant:provision -- …same args… --confirm<br>``` | Only with `--confirm` | JSON `mode=dry_run` then `mode=write`; `already_provisioned` / `dry_run_already_provisioned` on re-run |
| Church + HQ/primary | Keys above | `npm run blessboard:church:provision` | ```bash<br>npm run blessboard:church:provision -- \<br>  --organization-key diagnostic-church \<br>  --church-key diagnostic-church \<br>  --display-name "BlessBoard Diagnostic Church" \<br>  --environment testing \<br>  --hq-branch-key hq \<br>  --hq-branch-name "Headquarters" \<br>  --deployment blessboard-org-v5<br># then add --confirm to write<br>``` | Only with `--confirm` | Church + `hq` primary present |

**Rollback / cleanup (catalogue):** **TOOLING GAP** — no approved CLI to delete org/church/domain. Do not invent DELETE SQL. If a bad re-provision creates conflict, stop and escalate to DBA with product approval.

---

## 4. MISSING / INVALID remediation matrix

Placeholders: `<PA_EMAIL>`, `<HQ_EMAIL>`, `<BA_EMAIL>`, `<MEMBER_EMAIL>` — operator-owned test addresses only. Passwords via stdin; never commit.

### 4.1 Users and roles (B02)

| Item | Required state | Existing tool | Command template | Writes data | Verification |
|------|----------------|---------------|------------------|-------------|--------------|
| Platform-admin user | Active `blessboard.users` row usable for Apex `/admin` | `npm run blessboard:user:create` | ```bash<br># Preview<br>npm run blessboard:user:create -- --email '<PA_EMAIL>' --display-name 'Platform Admin'<br># Write<br>printf '%s' '<TEMP_PASSWORD>' \| npm run blessboard:user:create -- \<br>  --email '<PA_EMAIL>' \<br>  --display-name 'Platform Admin' \<br>  --password-stdin \<br>  --confirm<br>``` | Only with `--confirm` | CLI JSON `ok`; Apex login succeeds later |
| Platform-admin role | Active `platform_admin` assignment | `npm run blessboard:user:role:assign` | ```bash<br>npm run blessboard:user:role:assign -- \<br>  --email '<PA_EMAIL>' \<br>  --organization-key diagnostic-church \<br>  --role platform_admin<br># then --confirm to write<br>``` | Only with `--confirm` | CLI `assigned` / `already_assigned` / dry-run equivalents; `/admin` **200** after login |
| HQ-admin user | Active user | `blessboard:user:create` | Same pattern with `<HQ_EMAIL>` / display-name `HQ Admin` + `--confirm` | Only with `--confirm` | CLI `ok` |
| HQ-admin role | Active `church_hq_admin` on church | `blessboard:user:role:assign` | ```bash<br>npm run blessboard:user:role:assign -- \<br>  --email '<HQ_EMAIL>' \<br>  --organization-key diagnostic-church \<br>  --role church_hq_admin \<br>  --church-key diagnostic-church \<br>  --confirm<br>``` | Only with `--confirm` | Transfer → `/hq` **200** |
| Branch-admin user | Active user | `blessboard:user:create` | `<BA_EMAIL>` / `Branch Admin` + `--confirm` | Only with `--confirm` | CLI `ok` |
| Branch-admin role | Active `branch_admin` on `hq` | `blessboard:user:role:assign` | ```bash<br>npm run blessboard:user:role:assign -- \<br>  --email '<BA_EMAIL>' \<br>  --organization-key diagnostic-church \<br>  --role branch_admin \<br>  --church-key diagnostic-church \<br>  --branch-key hq \<br>  --confirm<br>``` | Only with `--confirm` | Transfer → `/branch-admin` **200**; branch-scoped data only |
| Member user + primary membership | Active member linked to user; primary `member_branch_memberships` on `hq` | **No member-create CLI** → UI registration + BA approval | 1. Authoritative (or reachable) tenant: `https://diagnostic.blessboard.org/register`<br>2. Submit disposable `<MEMBER_EMAIL>`<br>3. BA: `/branch-admin/registrations` approve/activate | Yes (UI) | Member login → `/member` **200**; primary membership on `hq` |

**Hosted confirmation IDs:** `U-PA`, `R-PA`, `U-HQ`, `R-HQ`, `U-BA`, `R-BA`, `U-MEM` (registration), `U-MEM-APPROVE`.

**Rollback / cleanup**

| Write | Supported cleanup | Gap |
|-------|-------------------|-----|
| User create | **TOOLING GAP** — no `blessboard:user:deactivate` / delete CLI | Do not invent SQL; leave unused test users or escalate |
| Role assign | **TOOLING GAP** — no role-revoke CLI | Roles are additive; do not invent DELETE |
| Member registration | Reject / leave pending via **BA registrations UI** where product allows | Prefer UI over SQL |
| Passwords | Operator rotates via product flows if available | No password-reset CLI documented for V5 demo |

### 4.2 Public content (B03)

| Item | Required state | Existing tool | Command template | Writes data | Verification |
|------|----------------|---------------|------------------|-------------|--------------|
| Published Home | `blessboard.public_pages` `page_key=home` published for church | Content admin UI (HQ or BA) | Sign in as HQ/BA → content / pages → edit Home → publish (CSRF). **No** V5 content-seed CLI. | Yes (UI) | Tenant `GET /` shows published home **or** intentional empty only with signed waiver |
| Published About | `page_key=about` published | Content admin UI | Same for About | Yes (UI) | Tenant `/about` **200** with published body |

**Hosted confirmation IDs:** `CMS-HOME`, `CMS-ABOUT`.

**Rollback / cleanup:** Unpublish or revert to draft via the **same content admin UI** if the product supports it. **TOOLING GAP** if no unpublish control — do not invent SQL; document waiver.

### 4.3 Operational samples (B04)

Create **≥1** safe published/operational row per module you will click in smoke. Prefer UI; one module at a time.

| Item | Required state | Existing tool | Command template | Writes data | Verification |
|------|----------------|---------------|------------------|-------------|--------------|
| Announcement sample | ≥1 published/safe announcement | BA/HQ announcements UI | Create + publish via `/branch-admin/announcements` or `/hq/announcements` | Yes (UI) | Visible to intended audience |
| Event sample | ≥1 event | Participation / events admin UI | Create via mounted HQ/BA participation or content routes | Yes (UI) | Member or public list shows row |
| Ministry sample | ≥1 ministry | Same family of admin UIs | Create + publish as product allows | Yes (UI) | List non-empty |
| Sermon sample | ≥1 sermon (if demoing sermons) | Content / sermons admin UI | Publish via UI | Yes (UI) | Public sermons list |
| Resource sample | ≥1 resource | Forms/resources admin | Create + publish | Yes (UI) | Member/resources or admin list |
| Form sample | ≥1 form | Forms admin | Create + publish | Yes (UI) | Member can open form |
| Member request sample | Optional; may arise from member UI | Member requests + BA review | Submit as MEM; review as BA | Yes (UI) | Request visible in BA scope |
| Giving method sample | ≥1 instructional method (no processor) | Giving admin UI | Create method via BA/HQ giving settings | Yes (UI) | Giving page shows method; **no** live checkout |
| Attendance sample | ≥1 attendance event | Attendance admin UI | Create event via BA | Yes (UI) | Event listed for branch |

**Hosted confirmation IDs:** `OPS-ANN`, `OPS-EVT`, `OPS-MIN`, `OPS-SER`, `OPS-RES`, `OPS-FORM`, `OPS-REQ`, `OPS-GIV`, `OPS-ATT` (confirm only those you will demo).

**Rollback / cleanup:** Soft-archive / unpublish / cancel via **product UI** where available. **TOOLING GAP** for bulk wipe CLI — do not invent SQL.

### 4.4 Media (smoke T18–T19)

| Item | Required state | Existing tool | Command template | Writes data | Verification |
|------|----------------|---------------|------------------|-------------|--------------|
| Library asset | ≥1 allowlisted image/PDF in church media library | Media picker upload (BA/HQ content) | Open picker → upload JPEG/PNG/WebP/GIF ≤5MiB or PDF ≤15MiB with CSRF | Yes (UI + storage) | Asset appears in library; public delivery only if marked public |
| Private deny proof | Private asset not readable by ANON | Same | Upload as private; ANON `GET /_bb/media/:id` | Yes | ANON denied |

**Hosted confirmation ID:** `MEDIA-UP`.

**Rollback / cleanup:** **Soft-archive** via media picker confirm UI (supported). Hard-delete HTTP is not offered — do not invent SQL.

### 4.5 INVALID path (must not remediate this way)

| Item | Required state | Existing tool | Command template | Writes data | Verification |
|------|----------------|---------------|------------------|-------------|--------------|
| Legacy demo seed | Must **not** create `public.church_*` / `public.tenants` on V5 | `npm run church:seed-demos` | **DO NOT RUN** against V5 `DATABASE_URL` | Would write **INVALID** shapes | N/A — treat as forbidden |
| V4 pilot seeds | Same | `church:pilot:seed` / related | **DO NOT RUN** | Invalid for V5 | N/A |

---

## 5. Ordered execution plan (when authorized)

Do **not** start this sequence from documentation alone — obtain an operator order that cites this file and the confirmation gate.

| Phase | Steps | Hosted confirmation | Depends on |
|-------|-------|---------------------|------------|
| A | Read-only preflight (`db:identity:check`, `db:status`, `db:verify:foundation`) | None | Env fixed |
| B | Catalogue re-confirm (optional; expect already provisioned) | `CAT-RECONFIRM` | A |
| C | Create PA user + `platform_admin` | `U-PA`, `R-PA` | B |
| D | Create HQ + BA users + roles | `U-HQ`, `R-HQ`, `U-BA`, `R-BA` | C |
| E | Publish Home + About | `CMS-HOME`, `CMS-ABOUT` | D (staff session) |
| F | Operational samples for modules in scope | `OPS-*` | E |
| G | Media upload sample | `MEDIA-UP` | D |
| H | Member register + BA approve | `U-MEM`, `U-MEM-APPROVE` | Routing allows tenant registration (**authoritative** or approved exception) |
| I | Re-run readiness checklist mentally / update readiness doc after ops | None | H |
| J | Full smoke [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md) | Separate routing approvals | I + shadow evidence + authoritative approval |

**Note on Phase H:** Member registration on the hosted demo hostname typically needs `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` (or another approved way to reach tenant public). That mode flip is **not** part of this remediation plan — see shadow / authoritative docs. Until then, staff personas + CMS can still be prepared; member portal smoke remains blocked.

---

## 6. Tooling gaps (summary)

| Gap | Blocks | Interim workaround |
|-----|--------|--------------------|
| No V5 CMS / module seed CLI | Home/About/ops samples | Content + module **admin UIs** |
| No member-create CLI | Member persona | Tenant `/register` + BA approval |
| No user deactivate / delete CLI | Cleanup of disposable users | Leave fixtures; escalate for DBA policy |
| No role-revoke CLI | Undo mistaken roles | Avoid dual-role mistakes; escalate |
| No catalogue teardown CLI | Undo bad provision | Idempotent re-run only; escalate conflicts |
| No approved demo SQL pack | All of the above | **Do not invent SQL** |
| Legacy `church:seed-demos` | Tempting but **INVALID** | Never use on V5 |

**Closed by task 63:** dry-run default, `--confirm` writes, `DATABASE_IDENTITY_EXPECTED` match on platform provision, deployment verification, GETPRO refuse, legacy `public.tenants`/`public.session` refuse, dual machine/human reports on the four V5 demo CLIs.

---

## 7. Hosted-write steps requiring supervision

All of the following require §0 confirmation when `DATABASE_URL` is hosted:

1. `platform:tenant:provision` / `blessboard:church:provision` (even idempotent)
2. Every `blessboard:user:create`
3. Every `blessboard:user:role:assign`
4. Every CMS publish / module create / media upload / registration approve in the hosted UI
5. Soft-archive / unpublish cleanup on hosted

**Not hosted data writes (still need separate ops approval):** Hostinger env changes, routing mode, DNS, `db:migrate`, `migrate:v4-to-v5:*`.

---

## 8. Is the plan executable?

| Question | Answer |
|----------|--------|
| Is this **plan document** complete enough to guide operators? | **YES** |
| Can operators close **all** MISSING items with existing tools alone? | **YES, with UI for member + CMS + samples + media** — no invented SQL required |
| Can operators close MISSING items **without** any hosted write? | **NO** — B02–B04 require hosted (or equivalent) writes |
| Can member persona be completed while routing stays `off`/`shadow`? | **Usually NO** on `diagnostic.blessboard.org` public registration — needs tenant public reachability (**authoritative** or approved exception) |
| Should anyone run this plan automatically / from CI? | **NO** |
| Overall | **Executable as a supervised operator runbook** after confirmation gates; **not** auto-executable; member step gated by routing |

---

## 9. Post-remediation verification (read-only / UI)

Align with readiness §4 and smoke DB checklist:

| Check | Pass |
|-------|------|
| PA / HQ / BA can login and open portals | T09–T10, T15–T17 |
| Published Home/About | T06–T07 |
| ≥1 sample per exercised module | T14–T16 |
| Media upload + soft-archive | T18–T19 |
| Member portal | T14 |
| Legacy tables still absent | T31 |
| Update [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) statuses from MISSING → READY after evidence | Ops |

---

## 10. Suggested commit message

```
docs(testing): add V5 demo tenant remediation plan

Map MISSING readiness items to existing CLIs and UI workflows with hosted-write gates and tooling gaps.
```
