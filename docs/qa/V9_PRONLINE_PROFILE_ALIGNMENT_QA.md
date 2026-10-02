# V9 Pronline Profile Alignment QA

**Task:** `V9_PRONLINE_PROFILE_ALIGNMENT`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Targets:** `blessboard.pronline.org`, `activeclinic.pronline.org`  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V9_PRONLINE_PROFILE_ALIGNMENT_PASS`**

Pronline keeps existing deployment code **`moovex-platform-testing`** (no invented V9 code). Profile **`platformLine`** elevated to **`v8`** so About uses product **Version 2.02**, while domains, cookies, DB identity (`moovex-platform-v7` / `testing`), and `mediaWriteNamespace=testing` stay on the historical pronline testing app. Neuniversity remains **`moovex-platform-v8-testing`** (domain-isolated).

**Hosted confirmed** on `3a9fa6f71ad7` (alignment tip; prior smoke `d05f93ee8d0b`): BB+AC About **2.02**, `/healthz` `platformLine=v8`, identity testing. Production untouched.

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

| Check | Result |
| --- | --- |
| BB `/about` → 2.02 | **PASS** (`Version 2.02` / `Release 2.02`) |
| AC `/about` → 2.02 | **PASS** (`Version 2.02`) |
| `/healthz` | **PASS** `gitSha=3a9fa6f71ad7` · `platformLine=v8` · `moovex-platform-testing` · identity `moovex-platform-v7` / `testing` |
| BB+AC public `/` + `/login` | **PASS** HTTP 200 |
| Cross-product host isolation | **PASS** unit + live BB≠AC shell |
| Production unchanged | **YES** — no prod deploy; `origin/V7-first-production` still `03a89106…`; neuniversity still `b186991d` / `moovex-platform-v8-testing` |

**Note:** Live SHA is alignment tip `d05f93ee…` (descendant of freeze `v2.02` / `3b94485c`). Freeze tag was not retargeted.

---

## Return token

```
V9_PRONLINE_PROFILE_ALIGNMENT_PASS
deployment_code=moovex-platform-testing
platformLine=v8
about=2.02
healthz_sha=3a9fa6f71ad7
db_identity=moovex-platform-v7/testing
prod_untouched=YES
```
