# V2.01 Release Baseline and About Version

**Task:** `V2.01_RELEASE_BASELINE_AND_ABOUT`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Target deployment:** `moovex-platform-v8-testing` (neuniversity.org)  
**Products:** BlessBoard and ActiveClinic  

**Verdict:** `V2_01_RELEASE_BASELINE_PASS`

---

## 1. Initial baseline (Step 1 — before change)

| Item | Value |
|------|-------|
| Local branch | `V8` (tracking `origin/V8`) |
| Initial HEAD / `origin/V8` | `3d3c7b39287f351795d6abeaa6f4a61779369dde` |
| Hosted V8 testing SHA (live `/healthz`) | `3d3c7b39287f` — **matched** tip at baseline |
| Hosted deployment code | `moovex-platform-v8-testing` |
| Hosted environment | `testing` |
| Hosted platformLine | `v8` |
| Database identity (expected) | `moovex-platform-v7` / `testing` |
| Session cookie | `moovex_platform_v8_testing_sid` |
| Media namespace | `testing-v8` |
| `schemaCompatible` | `true` |

### Hosted V8 hosts checked at baseline (read-only)

| Host | `/healthz` | gitSha | deploymentCode |
|------|------------|--------|----------------|
| `https://neuniversity.org/healthz` | 200 ok | `3d3c7b39287f` | `moovex-platform-v8-testing` |
| `https://blessboard.neuniversity.org/healthz` | 200 ok | `3d3c7b39287f` | `moovex-platform-v8-testing` |
| `https://activeclinic.neuniversity.org/healthz` | 200 ok | `3d3c7b39287f` | `moovex-platform-v8-testing` |

### About pages before change (hosted)

| URL | Product | Displayed version | Build |
|-----|---------|-------------------|-------|
| `https://blessboard.neuniversity.org/about` | BlessBoard | **Version 2.0** / Release 2.0 | `3d3c7b39287f` |
| `https://activeclinic.neuniversity.org/about` | ActiveClinic | **Version 2.0** / Enterprise v2.0 | `3d3c7b39287f` |

### Shared version metadata (source of truth)

| Constant | File | Before | After |
|----------|------|--------|-------|
| `VERSION_BASE_V8` | `src/platform/build/applicationBuildInfo.js` | `2.0` | `2.01` |
| `PRODUCT_VERSION_V8` | same | `2.0` | `2.01` |
| V7 constants | same | `1.03` / `1.3` | **unchanged** |

About EJS templates already consume `buildInfo` from `getApplicationBuildInfo()` — no per-product hardcoded V8 version strings were added.

### Production (explicitly untouched)

| Host | deploymentCode | environment | gitSha |
|------|----------------|-------------|--------|
| `https://blessboard.com/healthz` | `moovex-platform-production` | `production` | `03a89106e2fe` |
| `https://activeclinic.org/healthz` | `moovex-platform-production` | `production` | `03a89106e2fe` |

No production deploy, env, DB, or media changes were made.

V7 testing (`pronline.org`, `moovex-platform-testing`) remains on `03a89106e2fe` — not modified.

---

## 2. Version update (Step 2)

### Changed files

| File | Change |
|------|--------|
| `src/platform/build/applicationBuildInfo.js` | Bump V8 `VERSION_BASE_V8` / `PRODUCT_VERSION_V8` to `2.01`; comment sync |
| `tests/v8-about-version-2.test.js` | Assert Version **2.01** for BB + AC About + shared helpers |
| `docs/releases/V2_01_RELEASE_BASELINE.md` | This baseline report |

### Preserved

- About layouts, images, branding, copyright, navigation
- Build SHA shown separately from product version (V8 scheme)
- Independent BlessBoard vs ActiveClinic product identity (`data-product`, titles, Enterprise/Release chrome)
- V7 About format (`1.03.<sha>` / Version 1.3)
- QA hub marketing copy still says “Version 2.0 Development and Testing” / “V2.0” product cards (hub launcher only; not About)

### Version before → after (V8 About)

| Surface | Before | After |
|---------|--------|-------|
| BlessBoard About | Version 2.0 / Release 2.0 | Version **2.01** / Release **2.01** |
| ActiveClinic About | Version 2.0 / Enterprise v2.0 | Version **2.01** / Enterprise v**2.01** |

---

## 3. Local verification

| Check | Result |
|-------|--------|
| `node --test tests/v8-about-version-2.test.js` | **8/8 PASS** |
| BlessBoard apex `/about` (supertest, V8 env) | Version 2.01, Release 2.01, `data-product="BlessBoard"`, build SHA present, no `1.03.` / Release 1.3 |
| ActiveClinic `/about` (supertest, V8 env) | Version 2.01, Enterprise v2.01, `data-product="ActiveClinic"`, build SHA present |
| Shared `getApplicationBuildInfo` BB=AC | Same object on identical V8 env |

---

## 4. Final SHA accounting

| Role | Full SHA | 12-char |
|------|----------|---------|
| Initial tip (pre-change) | `3d3c7b39287f351795d6abeaa6f4a61779369dde` | `3d3c7b39287f` |
| Version bump commit | `9cbfea8270788192e69285962b6e466ffecad80e` | `9cbfea827078` |
| Hosted V8 testing after deploy | matches `9cbfea827078` on all three hosts | **yes** |

Application code for Version 2.01 is commit `9cbfea8270788192e69285962b6e466ffecad80e` (pushed to `origin/V8`). Hostinger served that SHA for About verification. A follow-up docs-only commit may advance `origin/V8` beyond the verified app SHA without changing version behavior.

---

## 5. Hosted verification (after deploy)

| Check | Result |
|-------|--------|
| `neuniversity.org` /healthz | `gitSha=9cbfea827078`, `moovex-platform-v8-testing`, `testing`, `v8`, identity `moovex-platform-v7`, `schemaCompatible=true` |
| `blessboard.neuniversity.org` /healthz | same tip + profile |
| `activeclinic.neuniversity.org` /healthz | same tip + profile |
| BB About desktop | **200**, `data-product="BlessBoard"`, **Version 2.01**, Release 2.01, build `9cbfea827078`, `/about` nav present, no stale Version 2.0 |
| AC About desktop | **200**, `data-product="ActiveClinic"`, **Version 2.01**, Enterprise v2.01, build `9cbfea827078`, `/about` nav present |
| BB / AC About mobile UA | Version 2.01 + product identity + build `9cbfea827078` |
| Public smoke | BB `/` 200, AC `/` 200, BB `/contact` 200, AC `/clinics` 200, BB+AC `/login` 200 |
| Production after change | Still `moovex-platform-production` / `production` / `03a89106e2fe` — **untouched** |

---

## 6. Completion gate

| Gate | Status |
|------|--------|
| `origin/V8` includes version bump | **PASS** (`9cbfea82`) |
| Hosted V8 testing serves that commit | **PASS** (`9cbfea827078` on all three hosts) |
| Both About pages show Version 2.01 | **PASS** |
| Production untouched | **PASS** |

**Verdict:** `V2_01_RELEASE_BASELINE_PASS`
