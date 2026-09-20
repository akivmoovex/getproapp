# V8 Initial Bug Fix QA — Domains (503) & About Version 2.0

**Recorded:** 2026-09-20T16:30:00Z (approx.)  
**Branch:** `V8`  
**Bugs in scope:** V8-BUG-002 (shared deployment 503), V8-BUG-001 (About Version 2.0)  
**Final status:** `V8_INITIAL_BUG_FIX_QA_BLOCKED`

**Why blocked:** Hosted V8 on `*.neuniversity.org` still returns Hostinger-edge HTTP **503** with no Node upstream. Homepages, About pages, login/registration, product routing, and hosted SHA verification **cannot** be claimed. Automated gates and V7 compatibility checks passed. Do **not** treat local PASS as hosted PASS.

Related: [`V8_BUG_002_SHARED_DEPLOYMENT_503.md`](./V8_BUG_002_SHARED_DEPLOYMENT_503.md), [`V8_HOSTINGER_TESTING_ENV.md`](../platform/V8_HOSTINGER_TESTING_ENV.md), Prompt 02 About 2.0 on commit `42f7bd5a`.

---

## 1. Branch alignment

| Check | Result |
|-------|--------|
| Current branch | `V8` |
| Local `HEAD` | `42f7bd5a4fef32229269a1c9ce2707811c5a748f` |
| `origin/V8` | Same SHA (synced before this report commit) |
| Working tree for app code | Clean relative to that tip prior to this report |

---

## 2. Hosted V8 SHA

| Host | `/healthz` | Hosted SHA |
|------|------------|------------|
| `blessboard.neuniversity.org` | **503** HTML | **Unavailable** |
| `activeclinic.neuniversity.org` | **503** HTML | **Unavailable** |

`npm run test:v8:hosted-smoke` → exit **3**, `ROOT_CAUSE=HOSTINGER_EDGE_NO_UPSTREAM` (stock hCDN 503; no `x-hcdn-upstream-rt` / `x-request-id`).

**Expected when unblocked:** `deploymentCode=moovex-platform-v8-testing`, `platformLine=v8`, `gitSha` matching `origin/V8` (at least `42f7bd5a…` for About 2.0 + BUG-002 diagnostics).

---

## 3. V8 homepage HTTP status

| URL | Status |
|-----|--------|
| `https://blessboard.neuniversity.org/` | **503** |
| `https://activeclinic.neuniversity.org/` | **503** |

Gate **not met** (required HTTP 200).

---

## 4. V8 About — Version 2.0 + build identifier

| URL | Status | Version / build |
|-----|--------|-----------------|
| `https://blessboard.neuniversity.org/about` | **503** | Not readable |
| `https://activeclinic.neuniversity.org/about` | **503** | Not readable |

**Local / automated expectation** (same shared `getApplicationBuildInfo` for BB+AC when `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing` and `GETPRO_GIT_SHA=42f7bd5a…`):

- Product label: **Version 2.0**
- `productVersion` / `version`: **2.0**
- Build: **42f7bd5a4fef** (12-char Git SHA; not invented)

Covered by `tests/v8-about-version-2.test.js` (PASS in regression). **Not** verified on hosted V8.

---

## 5. Product routing (hosted)

| Host | Expected product | Hosted result |
|------|------------------|---------------|
| `blessboard.neuniversity.org` | BlessBoard | **Blocked** (503) |
| `activeclinic.neuniversity.org` | ActiveClinic | **Blocked** (503) |

Automated hostname → product mapping remains covered by `tests/v8-environment-isolation.test.js` / host registry suites.

---

## 6. Login, registration, public navigation (hosted V8)

All probed V8 paths returned **503**: `/`, `/about`, `/login`, `/register` (BB+AC).

Hosted login / registration / nav: **not verified**.

---

## 7. Shared database identity (no credentials)

| Source | Identity (non-secret) |
|--------|------------------------|
| Intended V8 Hostinger env | `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`, `DATABASE_IDENTITY_ENV=testing` |
| Hosted V7 `/healthz` (live) | `expectedIdentityKey=moovex-platform-v7`, `expectedDatabaseEnvironment=testing` |
| Hosted V8 `/healthz` | **Unavailable** — cannot confirm V8 worker binding |

No credentials printed or committed.

---

## 8–9. V7 compatibility (pronline.org)

| Check | BB | AC |
|-------|----|----|
| `/healthz` | **200** — `moovex-platform-testing`, `gitSha=03a89106e2fe`, `schemaCompatible=true` | Same |
| `/` homepage | **200** | **200** |
| `/login` | **200** | **200** |
| `/about` | **200** — `data-product="BlessBoard"`, Release **1.3**, compound **1.03.03a89106e2fe**, build **03a89106e2fe**, **no** “Version 2.0” | **200** — `data-product="ActiveClinic"`, Enterprise **v1.3**, **1.03.03a89106e2fe**, build **03a89106e2fe**, **no** “Version 2.0” |

V7 application line and About **1.x** presentation remain unchanged. (BB `/register` timed out once during this run; AC public `/register` returns 404 on this host — historical AC pathing, not a V8 regression. Not used to claim V8 PASS.)

---

## 10. Production untouched

| Host | Result |
|------|--------|
| `https://blessboard.com/healthz` | **200** — `deploymentCode=moovex-platform-production`, `environment=production`, `gitSha=d4f5b190074d` |

No production deploy or env change performed.

---

## Automated regression (Prompts 01 + 02 + prior Phase 0)

Command: `npm run test:v8:regression:coverage`

| Suite | Result |
|-------|--------|
| `shared-platform` | **PASS** |
| `compatibility` | **PASS** |
| `blessboard` | **PASS** |
| `activeclinic` | **PASS** |

| Aggregate (final rollup) | Count |
|--------------------------|------:|
| Tests | **198** |
| Suites | **41** |
| Pass | **198** |
| Fail | **0** |
| Skipped | **0** |
| Cancelled | **0** |

Includes Prompt 01 `tests/v8-bug002-hostinger-upstream-503.test.js` and Prompt 02 `tests/v8-about-version-2.test.js`. No silent skips.

### Coverage (modified / gate modules)

Aggregate gate: **lines 92.17%**, branches **64.84%**, functions **95.62%**, statements **92.17%** → `[v8-coverage] PASS`

| Module | Lines | Branches |
|--------|------:|---------:|
| `src/platform/build/applicationBuildInfo.js` | **100%** (137/137) | 75% |
| `src/platform/ops/hostingerUpstreamProbe.js` | **94.85%** (129/136) | 64.86% |

---

## Bug status summary

| Bug | Code on `origin/V8` | Hosted verification |
|-----|---------------------|---------------------|
| V8-BUG-002 (503) | Diagnostics + runbook landed (`4e081537`+) | **Open** — edge 503 persists |
| V8-BUG-001 (About 2.0) | Shared build info + templates (`42f7bd5a`) | **Blocked** until V8 app serves |

---

## Outstanding blockers

1. Create/bind/start Hostinger Node app for `moovex-platform-v8-testing` on branch `V8`.
2. Attach `blessboard.neuniversity.org` + `activeclinic.neuniversity.org` to that app.
3. Set env (shared testing DB identity, distinct `SESSION_SECRET`, `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing`, `GETPRO_GIT_SHA`).
4. Deploy/restart V8 only; confirm `/healthz` 200 with expected SHA.
5. Re-run this checklist (homepages 200, About **Version 2.0** + build, login/nav, V7 still 1.3).

---

## Final status

**`V8_INITIAL_BUG_FIX_QA_BLOCKED`**

| Item | Value |
|------|--------|
| Report tip (`origin/V8`) | `79f883cdfc0c605fa61e9d2e00bdd0de94d38169` |
| Report body commit | `4c926f6702bc33a2857ea834e3f2f419478acf90` |
| App tip verified pre-report | `42f7bd5a4fef32229269a1c9ce2707811c5a748f` |
| Hosted V8 SHA | Unavailable |
| V8 homepage status | BB **503**, AC **503** |
| V8 About displayed versions | Unavailable (expected Version 2.0 + `42f7bd5a4fef` locally) |
| V7 About displayed versions | BB Release **1.3** / `1.03.03a89106e2fe`; AC Enterprise **v1.3** / same compound |
| Outstanding blocker | Hostinger V8 Node upstream missing |

*Automated evidence only supports code readiness. Hosted PASS requires live 200s on both V8 domains.*
