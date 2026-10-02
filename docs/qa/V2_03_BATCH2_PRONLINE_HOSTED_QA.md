# V2.03 Batch 2 — Pronline Hosted QA

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH2_PRONLINE_HOSTED_QA` |
| **Date** | 2026-09-26 |
| **Intended branch** | `V10` (V2.03 ActiveClinic Batch 1/2 testing line — confirmed in `docs/v2.03/*`) |
| **Hosts probed** | `activeclinic.pronline.org` only (BlessBoard healthz identity cross-check) |
| **Production** | **Untouched** — no production domains contacted; no prod deploy/restart |
| **Verdict** | **`V2_03_BATCH2_PRONLINE_QA_BLOCKED`** |

---

## Exact blocker

**`V2_03_BATCH2_PRONLINE_QA_BLOCKED: hosted SHA 802912259ab0 matches origin/V10 and lacks all V2.03 Batch 1/2 commits; local V10 tip 40107164c00c is 20 commits ahead and unpushed; Batch 2 assets (`ac-app-tokens.css`, `gp-ops-shared.css`) and Batch 1 routes (`/app/services`, `/app/performance`) return hosted 404; no authorized push/hPanel redeploy performed.`**

---

## Prerequisite gates (local)

| Gate | Status |
|------|--------|
| Batch 2 implementation (AC-B2-01…10) | Local PASS (prior commits on `V10`) |
| Stitch visual parity | Local PASS (`V2_03_BATCH2_STITCH_PARITY_PASS`) |
| Shared regression | Local PASS (`V2_03_BATCH2_SHARED_REGRESSION_PASS`) |
| RBAC / isolation | Local PASS (`V2_03_BATCH2_RBAC_ISOLATION_PASS`) |
| Hosted deploy of that tip | **Not available** |

---

## SHA / deployment identity

| Item | Value |
|------|--------|
| **Local `HEAD` (V10)** | `40107164c00c838ac81a311a7a0da1d4d6616ba2` (`40107164`) |
| **`origin/V10`** | `802912259ab0fdea48fe0a3b6596e3a4b2080383` (`80291225`) |
| **Hosted `/healthz` `gitSha`** | `802912259ab0` — **matches `origin/V10`** |
| **Local vs origin** | Local **ahead by 20 commits** (Batch 1 + Batch 2 + reconciliations); **not pushed** |
| **Deploy / restart** | **Not performed** — workflow requires git on Hostinger app branch + hPanel redeploy; push not authorized in this task; no hPanel credentials in agent session |
| **Deployment code** | `moovex-platform-testing` |
| **Environment** | `testing` |
| **DB identity** | `expectedIdentityKey=moovex-platform-v7` · `expectedDatabaseEnvironment=testing` |
| **Platform line** | `v8` (About still shows product **Version 2.02**) |
| **Session cookie** | `moovex_platform_testing_sid` |
| **Media namespace** | `testing` |
| **Schema compatibility** | `schemaCompatible=true` on hosted tip |
| **About Build Commit** | `802912259ab0` |

---

## Why hosted cannot certify Batch 2

`origin/V10` and pronline still sit on the V2.02 QA tip (`80291225` / tag era). All V2.03 Batch 1 and Batch 2 commits exist only on local `V10` (and uncommitted follow-ups for shared regression / RBAC docs/tests).

Evidence on hosted tip:

| Probe | Result | Interpretation |
|-------|--------|----------------|
| `GET /activeclinic/ac-app-tokens.css` | **404** (ActiveClinic not-found HTML) | Canonical B2 staff tokens **absent** |
| `GET /platform/gp-ops-shared.css` | **404** | Shared ops CSS **absent** |
| `GET /app/services` | **404** | Batch 1 ACN02–03 **not deployed** |
| `GET /app/performance` | **404** | Batch 1 ACN25 **not deployed** |
| `GET /activeclinic/ac-app.css` | **200** (~63KB) | Pre-B2 staff CSS still present |
| Auth-gated `/app/*` Batch 2 paths | **303 → `/login`** | Routes may exist from earlier engines, but **B2 Stitch chrome/assets are not on this SHA** |

Authenticated desktop/390 Stitch smoke, RBAC role matrix, and tenant/facility UI context **cannot** be certified on this hosted build.

---

## Routes tested (unauthenticated smoke)

Host: `https://activeclinic.pronline.org`  
Method: HTTP GET via curl (no production hosts).

| Route | HTTP | Notes |
|-------|------|--------|
| `/healthz` | **200** | SHA `802912259ab0`; testing identity OK |
| `/login` | **200** | Login page loads |
| `/app` | **303** → `/login` | Auth required |
| `/app/patients` | **303** → `/login` | Auth required |
| `/app/appointments` | **303** → `/login` | Auth required |
| `/app/clinical` | **303** → `/login` | Auth required |
| `/app/pharmacy` | **303** → `/login` | Auth required |
| `/app/pharmacy/queue` | **303** → `/login` | Auth required |
| `/app/diagnostics` | **303** → `/login` | Auth required |
| `/app/diagnostics/laboratory/queue` | **303** → `/login` | Auth required |
| `/app/diagnostics/radiology/queue` | **303** → `/login` | Auth required |
| `/app/billing` | **303** → `/login` | Auth required |
| `/app/billing/invoices` | **303** → `/login` | Auth required |
| `/app/cashier` | **303** → `/login` | Auth required |
| `/app/settings/clinic-setup/departments` | **303** → `/login` | Auth required |
| `/app/facilities` | **303** → `/login` | Auth required |
| `/app/services` | **404** | Batch 1 missing |
| `/app/performance` | **404** | Batch 1 missing |
| `/activeclinic/ac-app.css` | **200** | Legacy/pre-B2 asset |
| `/activeclinic/ac-app-tokens.css` | **404** | **Batch 2 blocker** |
| `/platform/gp-ops-shared.css` | **404** | **Batch 2 blocker** |

### Not completed on hosted (blocked by SHA lag)

| Check | Status |
|-------|--------|
| Authenticated staff shell | **BLOCKED** — need deploy of Batch 2 tip + QA login |
| Desktop rendering of B2 screens | **BLOCKED** |
| 390px rendering | **BLOCKED** |
| Patients / appointments / encounter / pharmacy / diagnostics / billing / departments UI | **BLOCKED** for B2 Stitch parity |
| Hosted RBAC / facility context UI | **BLOCKED** (local RBAC PASS only) |
| Assets CSS/JS for B2 tokens + gp-ops | **FAIL** (404) |
| Server log review | **NOT AVAILABLE** (no hPanel/SSH) |

---

## Remaining gaps / required operator actions

1. **Commit** any remaining local audit/test deltas (shared regression, RBAC suite/doc) if not already in the 20-commit tip.  
2. **Push** `V10` tip to `origin/V10` (explicit owner authorization).  
3. **Hostinger hPanel:** ensure `moovex-platform-testing` (pronline) Git branch tracks `V10`, redeploy/restart so `/healthz.gitSha` equals the Batch 2 tip.  
4. Confirm DB migrations for any Batch 1/2 schema still pending on `moovex-platform-v7` / `testing` (hosted currently reports schemaCompatible on the **old** tip only).  
5. Re-run this hosted QA with authenticated AC testing users: shell, desktop + 390, each Batch 2 route, RBAC denials, facility switcher.  
6. Do **not** promote to production.

---

## Policy compliance

| Constraint | Observed |
|------------|----------|
| V10 intended for V2.03 testing | **Yes** |
| Pronline testing hosts only | **Yes** (`*.pronline.org`) |
| No production touch | **Yes** |
| Deploy only if authorized | **No deploy** — push/hPanel not authorized in-session |
| Do not weaken security for Stitch | N/A on hosted (code not present) |

---

## Verdict

Hosted ActiveClinic pronline is healthy on **V2.02-era** SHA `802912259ab0` and cannot execute Batch 2 hosted QA until `V10` Batch 2 tip is pushed and redeployed.

**`V2_03_BATCH2_PRONLINE_QA_BLOCKED: hosted SHA 802912259ab0 matches origin/V10 and lacks all V2.03 Batch 1/2 commits; local V10 tip 40107164c00c is 20 commits ahead and unpushed; Batch 2 assets (`ac-app-tokens.css`, `gp-ops-shared.css`) and Batch 1 routes (`/app/services`, `/app/performance`) return hosted 404; no authorized push/hPanel redeploy performed.`**
