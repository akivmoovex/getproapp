# V9 Pronline Profile Alignment QA

**Task:** `V9_PRONLINE_PROFILE_ALIGNMENT`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Targets:** `blessboard.pronline.org`, `activeclinic.pronline.org`  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V9_PRONLINE_PROFILE_ALIGNMENT_PASS`** *(code + unit)* / hosted confirm below

Pronline keeps existing deployment code **`moovex-platform-testing`** (no invented V9 code). Profile **`platformLine`** elevated to **`v8`** so About uses product **Version 2.02**, while domains, cookies, DB identity (`moovex-platform-v7` / `testing`), and `mediaWriteNamespace=testing` stay on the historical pronline testing app. Neuniversity remains **`moovex-platform-v8-testing`** (domain-isolated).

Hosted About **2.02** requires Hostinger Deploy/Restart of the pronline Node app onto this commit (GitHub push alone is not instant).

---

## Decision (no invented profile)

| Option | Safe? | Outcome |
| --- | --- | --- |
| Point pronline at `moovex-platform-v8-testing` | **NO** | `canonicalDomain`/`apexDomains` are neuniversity-only; BASE_DOMAIN conflict |
| Invent `moovex-platform-v9-testing` | **NO** | Forbidden — not in catalogue |
| **Reuse `moovex-platform-testing` + `platformLine=v8`** | **YES** | Smallest change; V9 reuses V8 *line* for About 2.02 on pronline hosts |

---

## Code changes

| File | Change |
| --- | --- |
| `canonicalDeploymentProfiles.js` | `PROFILE_MOOVEX_PLATFORM_TESTING.platformLine`: `v7` → **`v8`**; subtitle **V9 Testing**; keep `mediaWriteNamespace=testing`, cookies, apex |
| `canonicalHostRegistry.js` | `pronline.org` / www / BB / AC hosts → `platformLine: "v8"` |
| `applicationBuildInfo.js` | Comment: V8 line includes V9 pronline testing |
| `domainMatrix.js` | Hostinger label note |
| Tests | Profile / About / isolation / session suites updated |

Unit: **50/50 PASS** (`v8-deployment-profile`, `v8-about-version-2`, `v8-environment-isolation`, `v8-tenant-product-isolation`, `v8-shared-session-security`).

---

## Expected runtime (after Hostinger restart)

| Field | Expected |
| --- | --- |
| Source branch | `V9` |
| `PLATFORM_DEPLOYMENT_CODE` | `moovex-platform-testing` |
| `platformLine` | **`v8`** |
| `DEPLOYMENT_ENV` | `testing` |
| DB identity | `moovex-platform-v7` / `testing` |
| About | **Version / Release 2.02** |
| Cookies | `moovex_platform_testing_sid` (unchanged name) |
| Media write ns | `testing` (unchanged) |
| SHA | Prefer tag `v2.02` → `3b94485c…` or current V9 tip containing this alignment |

---

## Hosted verification

*(Filled after push / operator restart.)*

| Check | Result |
| --- | --- |
| BB `/about` → 2.02 | _pending_ |
| AC `/about` → 2.02 | _pending_ |
| `/healthz` platformLine | _pending_ |
| BB+AC public `/` + `/login` | _pending_ |
| Cross-product host isolation | Unit PASS; live smoke _pending_ |
| Production unchanged | **YES** (no prod deploy) |

---

## Operator action (Hostinger)

1. Ensure pronline Node app Git branch = **`V9`**.  
2. **Deploy / Restart** after this commit lands on `origin/V9`.  
3. Do **not** set `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing` on pronline.  
4. Do **not** change production apps.
