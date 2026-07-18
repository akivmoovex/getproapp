# BlessBoard V5 — Shadow mode deployment runbook

**Date:** 2026-07-19
**Purpose:** Manual Hostinger steps to enable **only** `BLESSBOARD_TENANT_ROUTING_MODE=shadow`.
**Constraint:** This document is a runbook. Creating it does **not** deploy, change env, or run migrations.
**Routing target:** Keep **`BLESSBOARD_TENANT_ROUTING_MODE=shadow`**. Do **not** set `authoritative` from this runbook.

**Companions**

- [`V5_SHADOW_ROUTING_READINESS.md`](./V5_SHADOW_ROUTING_READINESS.md) — GO assessment
- [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) — catalogue READY for shadow; users/content MISSING for E2E
- [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) — full smoke after authoritative (out of scope here)
- [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) — Hostinger env template (Step 10)
- [`CONFIG_AND_DEPLOYMENT.md`](../CONFIG_AND_DEPLOYMENT.md) — Hostinger env injection / workers
- [`V5_IMPLEMENTATION_AND_STITCH_RECONCILIATION.md`](../database/V5_IMPLEMENTATION_AND_STITCH_RECONCILIATION.md) — restart / `/healthz`

---

## Runbook readiness

| Question | Answer |
|----------|--------|
| Is this runbook ready for **manual operator execution**? | **YES** — sequence, verify, stop, rollback, and evidence are defined. |
| Should operators set `authoritative` after this? | **NO** — approval checkpoint only (§15). Authoritative is a separate cutover. |
| Migrations required for this mode flip? | **NO** — routing mode is env + restart only. |

**Demo hostname:** `diagnostic.blessboard.org`
**Org / church:** `diagnostic-church`
**Primary / HQ branch:** `hq`
**Deployment code:** `blessboard-org-v5`
**DB identity:** `blessboard-platform-v5` / `testing`

---

## 1. Preconditions

Complete **before** changing the routing flag:

| # | Precondition | How to confirm | ☐ |
|---|--------------|----------------|---|
| P1 | Shadow readiness is **GO** | [`V5_SHADOW_ROUTING_READINESS.md`](./V5_SHADOW_ROUTING_READINESS.md) | ☐ |
| P2 | Demo catalogue READY for shadow | [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) §§1–7 (org, enrolment, church, HQ/primary, domain, env) | ☐ |
| P3 | V5 Hostinger app already serving apex | `GET https://blessboard.org/healthz` → **200** `{"ok":true,"mode":"v5-foundation"}` (or agreed V5 mode string) | ☐ |
| P4 | Routing currently `off` (or unset→`off`) | Hostinger env shows `BLESSBOARD_TENANT_ROUTING_MODE=off` or unset | ☐ |
| P5 | `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` | Hostinger env panel | ☐ |
| P6 | `DATABASE_URL` is V5 Supabase only | Hostinger env; identity expected `blessboard-platform-v5` | ☐ |
| P7 | DNS for demo host reaches V5 app | `diagnostic.blessboard.org` resolves to same app as apex | ☐ |
| P8 | All Node/LiteSpeed workers share the same env | [`CONFIG_AND_DEPLOYMENT.md`](../CONFIG_AND_DEPLOYMENT.md) — panel-injected vars | ☐ |
| P9 | Operator on call + log access | Can read Hostinger / app logs for `[blessboard-tenant-routing]` | ☐ |
| P10 | Stakeholders notified | Shadow is observational only — public HTML stays foundation | ☐ |

**Not required for shadow:** test users, published Home/About, operational CMS samples (those block full E2E only).

**Do not run** hosted migrations or `db:migrate` as part of this runbook.

---

## 2. Backup and rollback prerequisites

| # | Item | Status before flip | ☐ |
|---|------|--------------------|---|
| B1 | Know how to edit Hostinger env and restart **all** workers | Documented owner | ☐ |
| B2 | Rollback value prepared | Will set `BLESSBOARD_TENANT_ROUTING_MODE=off` | ☐ |
| B3 | Apex health baseline captured | `/healthz` **200** timestamp recorded | ☐ |
| B4 | Demo Host baseline captured | `Host: diagnostic.blessboard.org` `/` foundation **200**; no tenant CMS chrome | ☐ |
| B5 | V4 Hostinger / DNS inventory available | Only if apex itself breaks (DNS revert is last resort) | ☐ |
| B6 | No DB backup required for mode flip | Shadow does not write catalogue; rollback is env-only | ☐ |

Shadow rollback does **not** require restoring databases or reversing migrations.

---

## 3. Required environment values

Set on the **V5 Hostinger** application (panel env — preferred over file). Confirm these are present **before** or **as part of** the shadow flip:

```bash
NODE_ENV=production
DEPLOYMENT_ENV=testing
DATABASE_URL=<V5_SUPABASE_URL>
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
PLATFORM_HOST_CONTEXT_MODE=diagnostic
BLESSBOARD_TENANT_ROUTING_MODE=shadow
BLESSBOARD_JOBS_ENABLED=0

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

**This runbook’s target value:** `BLESSBOARD_TENANT_ROUTING_MODE=shadow` only.

Notes:

- Prefer Hostinger **Website → Settings & Redeploy / Environment variables** so every worker sees the same values ([`CONFIG_AND_DEPLOYMENT.md`](../CONFIG_AND_DEPLOYMENT.md)).
- Do **not** set session cookie `Domain=.blessboard.org`.
- Mode is never inferred from `NODE_ENV`, hostname, or Git branch.

---

## 4. Variables that must remain unset

| Variable / setting | Why |
|--------------------|-----|
| `GETPRO_DATABASE_URL` | Must not point V5 at legacy V4 DB |
| `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` | Out of scope — separate cutover after §15 |
| Parent-domain cookie `Domain=.blessboard.org` | Host-only cookies only |
| Fixture / seed flags that mutate live data | Not part of shadow enable |

---

## 5. Deployment sequence

This sequence is a **routing-mode enable**, not a schema deploy.

| Step | Action | ☐ |
|------|--------|---|
| D1 | Confirm P1–P10 and B1–B6 | ☐ |
| D2 | Record pre-change timestamp (ISO-8601 UTC) | ☐ |
| D3 | In Hostinger V5 env, set **only** `BLESSBOARD_TENANT_ROUTING_MODE=shadow` (leave other required vars unchanged unless correcting a known defect) | ☐ |
| D4 | Confirm `GETPRO_DATABASE_URL` still unset | ☐ |
| D5 | Confirm `PLATFORM_DEPLOYMENT_CODE` still `blessboard-org-v5` | ☐ |
| D6 | Save env in Hostinger panel | ☐ |
| D7 | Proceed to §6 Restart — do not skip | ☐ |
| D8 | Do **not** run migrations | ☐ |
| D9 | Do **not** set `authoritative` | ☐ |

If a code redeploy is already planned the same day, complete redeploy **first** with mode still `off`, verify apex (§7), **then** flip to `shadow` and restart again. Do not combine an untested code tip with the first shadow flip unless approved.

---

## 6. Restart sequence

| Step | Action | ☐ |
|------|--------|---|
| R1 | Restart **all** Node / LiteSpeed workers for the V5 app so every worker loads `shadow` | ☐ |
| R2 | Wait until workers report healthy / accepting traffic | ☐ |
| R3 | Confirm no worker still running with mode `off` (staggered restart risk) | ☐ |
| R4 | Record post-restart timestamp (ISO-8601 UTC) | ☐ |

Partial restarts can leave mixed mode behavior — treat incomplete restart as a **stop condition**.

---

## 7. Apex verification

Run immediately after restart:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/healthz
# expect 200

curl -sS https://blessboard.org/healthz
# expect JSON ok + v5-foundation (or agreed V5 mode string)

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/
# expect 200

curl -sS -o /dev/null -w '%{http_code}\n' https://blessboard.org/login
# expect 200
```

| Check | Expect | ☐ |
|-------|--------|---|
| `/healthz` | **200** V5 | ☐ |
| Apex `/` | **200** marketing/foundation | ☐ |
| Apex `/login` | **200** | ☐ |
| No 5xx / stack traces | Pass | ☐ |

**Stop** if apex auth or health fails — rollback (§13) before further tenant Host tests.

---

## 8. Demo hostname verification

```bash
# Demo tenant Host — still foundation HTML under shadow
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/
# expect 200

curl -sS -H 'Host: diagnostic.blessboard.org' https://blessboard.org/ | head -c 4000
# expect foundation / apex chrome
# must NOT contain tenant-public CMS shell markers
# must NOT render church CMS as the live tenant site

# Quiet path (no shadow log spam)
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: diagnostic.blessboard.org' https://blessboard.org/healthz
# expect 200

# Unknown host control
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' https://blessboard.org/
# expect 200 foundation (shadow fail-soft)
```

| Check | Expect | ☐ |
|-------|--------|---|
| Demo Host `/` | **200** foundation | ☐ |
| No tenant CMS chrome | Pass | ☐ |
| `/healthz` on demo Host | **200**; no new shadow event | ☐ |
| Unknown host | **200** foundation | ☐ |

---

## 9. Diagnostic log checks

1. Issue `GET /` with `Host: diagnostic.blessboard.org` (browser or curl).
2. In app logs, find prefix `[blessboard-tenant-routing]`.
3. Confirm JSON event **`blessboard_tenant_route_shadow`**.

| Field | Expected | ☐ |
|-------|----------|---|
| `hostname` | `diagnostic.blessboard.org` | ☐ |
| `platformResultType` | `resolved_tenant` | ☐ |
| `catalogueResultType` | `resolved` | ☐ |
| `proposedRouteOutcome` | `foundation` | ☐ |
| `proposedReason` | `shadow_match` | ☐ |
| `organizationKey` | `diagnostic-church` | ☐ |
| `churchKey` | `diagnostic-church` | ☐ |
| `primaryBranchKey` | `hq` | ☐ |
| `deploymentComparisonResult` | `match` | ☐ |
| Secrets absent | No passwords, tokens, `DATABASE_URL`, CSRF secrets | ☐ |

Authoritative event `blessboard_tenant_route` must **not** be the primary signal while mode is `shadow`.

---

## 10. Expected shadow behavior

| Surface | Expected |
|---------|----------|
| Public HTML on demo Host | Foundation / apex chrome (**not** tenant CMS) |
| Apex marketing + login | Unchanged **200** |
| Resolution | Org → BlessBoard enrolment → church → HQ/primary → domain → `blessboard-org-v5` |
| Logging | Observational `blessboard_tenant_route_shadow` with safe keys |
| Catalogue miss / unknown host | Still foundation **200** (fail-soft) |
| Sessions | May still establish on apex; cookie host-only |
| Jobs | Remain off (`BLESSBOARD_JOBS_ENABLED=0`) unless separately approved |

Shadow proves **routing resolution**, not tenant content delivery.

---

## 11. Unexpected behavior

| Observation | Likely cause | Action |
|-------------|--------------|--------|
| No shadow log on demo `/` | Mode still `off` on some workers; path skipped; wrong Host | Confirm env on **all** workers; restart again; hit `/` not `/healthz` |
| `deploymentComparisonResult=mismatch` | `PLATFORM_DEPLOYMENT_CODE` ≠ domain deployment | Fix env to `blessboard-org-v5`; do not set authoritative |
| Tenant CMS HTML appears | Mode accidentally `authoritative` or wrong app | **Stop** → rollback to `off` (§13) |
| Church name in HTML on demo Host | Same as above | **Stop** → rollback |
| Apex `/` or `/login` 5xx | Deploy/env/DB identity failure | **Stop** → rollback; check identity/`DATABASE_URL` |
| Secrets in shadow JSON | Logging bug / misconfig | **Stop** → rollback; treat as security incident |
| Mixed foundation vs tenant across requests | Partial worker restart | Restart **all** workers; re-verify |
| NXDOMAIN / wrong site | DNS not on V5 | Fix DNS before retrying shadow |

---

## 12. Stop conditions

Stop the enablement and execute §13 Rollback if **any** of the following occur:

1. Apex `/healthz`, `/`, or `/login` returns **5xx** or stack traces.
2. Demo Host serves tenant CMS / church public shell while intending shadow.
3. Session cookie set with parent `Domain=.blessboard.org`.
4. Secrets appear in shadow logs or HTML.
5. `GETPRO_DATABASE_URL` found set on V5.
6. Workers disagree on mode after restart.
7. Deployment comparison stuck on `mismatch` with no approved env fix.
8. Operator uncertainty whether mode is `shadow` vs `authoritative`.

Do **not** “fix forward” into `authoritative` to clear a shadow failure.

---

## 13. Rollback steps

```bash
# Hostinger V5 env + restart ALL workers
BLESSBOARD_TENANT_ROUTING_MODE=off
# Keep BLESSBOARD_JOBS_ENABLED=0 unless separately approved
```

Then:

| Step | Action | ☐ |
|------|--------|---|
| X1 | Save env; restart **all** workers | ☐ |
| X2 | `GET https://blessboard.org/healthz` → **200** | ☐ |
| X3 | Apex `/` + `/login` → **200** | ☐ |
| X4 | Demo Host `/` → foundation **200** (no tenant CMS) | ☐ |
| X5 | Confirm new requests no longer emit `blessboard_tenant_route_shadow` | ☐ |
| X6 | Notify stakeholders; preserve evidence pack | ☐ |
| X7 | Do **not** drop V5 DB; do **not** create `public.tenants` / `public.session` | ☐ |
| X8 | Do **not** set `GETPRO_DATABASE_URL` | ☐ |

DNS revert only if apex itself is broken beyond the routing flag.

---

## 14. Evidence to capture

| Artifact | Required | ☐ |
|----------|----------|---|
| Pre/post timestamps (UTC) | Yes | ☐ |
| Hostinger env screenshot or redacted key list showing `shadow` (no secret values) | Yes | ☐ |
| `/healthz` response body | Yes | ☐ |
| Demo Host `/` HTML snippet (first ~2KB) proving foundation | Yes | ☐ |
| One full `blessboard_tenant_route_shadow` JSON line (keys only; redact if needed) | Yes | ☐ |
| Unknown-host status code | Yes | ☐ |
| Confirmation `GETPRO_DATABASE_URL` unset | Yes | ☐ |
| Operator name + approval for the flip | Yes | ☐ |
| Go / Hold / Rollback decision for **shadow** | Yes | ☐ |

---

## 15. Approval checkpoint before authoritative mode

**This runbook ends at shadow.** Do not enable `authoritative` here.

| Gate | Required before any authoritative plan | ☐ |
|------|----------------------------------------|---|
| Shadow sign-off complete (§7–§10 green) | Yes | ☐ |
| Evidence pack filed (§14) | Yes | ☐ |
| Demo users + roles READY | [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) | ☐ |
| Published Home/About READY (for CMS E2E) | Same | ☐ |
| Full smoke plan reviewed | [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) | ☐ |
| Separate cutover owner approval | Written | ☐ |
| Explicit new runbook/change for `authoritative` | Not this document | ☐ |

**Checkpoint decision (shadow only):**

| Decision | ☐ |
|----------|---|
| Shadow **accepted** — remain on `shadow`; monitor logs | ☐ |
| Shadow **rejected** — rolled back to `off` | ☐ |
| Authoritative **not authorized** by this runbook | ☑ (fixed) |

---

## Operator quick card

```text
1. Confirm GO docs + apex healthy + mode off
2. Set BLESSBOARD_TENANT_ROUTING_MODE=shadow
3. Restart ALL workers
4. Verify apex /healthz + /login
5. Verify diagnostic.blessboard.org still foundation HTML
6. Capture blessboard_tenant_route_shadow (keys match diagnostic-church / hq / match)
7. On any stop condition → set mode off + restart
8. Do NOT set authoritative
```

---

## Suggested commit message (docs only)

```
Add V5 shadow mode Hostinger deployment runbook.
```
