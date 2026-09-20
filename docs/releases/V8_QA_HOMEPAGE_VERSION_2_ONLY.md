# V8 QA Homepage — Version 2.0 only

**Recorded:** 2026-09-20  
**Branch:** `V8`  
**Priority:** P1  
**Final status:** `V8_QA_HOMEPAGE_V2_ONLY_BLOCKED`

Code and tests are on `origin/V8` at **`4c62fe3fbf289fe649d271099aa048ea7f1c33cf`**.  
Hosted V8 still serves **`d9ac720d1b02`** (prior commit). The live `https://neuniversity.org/` hub still shows the mixed V7/V8/GetPro/Netraz launcher. Do **not** claim hosted PASS until Hostinger Deploy/Restart loads `4c62fe3f…` and the hub HTML is Version 2.0 only.

---

## 1. Changed files

| File | Change |
|------|--------|
| `src/platform/http/moovexPlatformRuntimeServer.js` | Platform-line-aware QA launcher: V8 hub = Moovex Platform V8 QA + Version 2.0 subtitle + BlessBoard/ActiveClinic V2.0 cards from deployment `apexDomains`; V7 hub matrix unchanged; www hub redirect generalized; hub-only 404 message domain-aware |
| `tests/v8-qa-homepage-v2-only.test.js` | Regression for all 10 required checks + www redirect |
| `scripts/v8/suite-manifest.js` | Wire test into shared-platform + compatibility suites |
| `scripts/v8/run-coverage.js` | Include new test in coverage file list |
| `docs/releases/V8_QA_HOMEPAGE_VERSION_2_ONLY.md` | This report |

**Not changed:** V7 deployment profiles, shared DB identity (`moovex-platform-v7` / `testing`), product routes, production.

---

## 2. Automated test results

| Gate | Passed | Failed | Skipped |
|------|--------|--------|---------|
| `tests/v8-qa-homepage-v2-only.test.js` | **9** | **0** | **0** |
| `npm run test:v8:regression` → shared-platform | **343** | **0** | **0** |
| `npm run test:v8:regression` → compatibility | **258** | **0** | **0** |
| `npm run test:v8:regression` → blessboard | **241** | **0** | **0** |
| `npm run test:v8:regression` → activeclinic | **104** | **0** | **0** |
| **Regression total** | **946** | **0** | **0** |
| V7 hub suite `tests/v7-hostinger-testing-runtime.test.js` | **15** | **0** | **0** |

Regression wall clock ≈ **156.5s**. Overall: **PASS**.

Covered assertions in the dedicated homepage suite:

1. V8 homepage HTTP 200  
2. Displays Version 2.0 + Moovex Platform V8 QA  
3. BlessBoard V8 link `https://blessboard.neuniversity.org/`  
4. ActiveClinic V8 link `https://activeclinic.neuniversity.org/`  
5–7. No V7 app links / no `pronline.org` app links / no Version 1.x labels  
8. Hostname product selection (BB / AC / hub)  
9. V8 deployment profile valid (`moovex-platform-v8-testing`, `BASE_DOMAIN=neuniversity.org`, DB identity `moovex-platform-v7`)  
10. V7 `pronline.org` launcher unchanged  

---

## 3. Coverage for modified code

`moovexPlatformRuntimeServer.js` remains a **justified exclusion** from the 90% line gate (large product-bootstrap / QA admin surface; see `scripts/v8/run-coverage.js`). New behavior is covered by `tests/v8-qa-homepage-v2-only.test.js` (hub HTML, link generation from deployment apex domains, V7 compatibility, www redirect).

---

## 4. V8 commit SHA

| Ref | SHA |
|-----|-----|
| Local `HEAD` / intended deploy | `4c62fe3fbf289fe649d271099aa048ea7f1c33cf` |
| `origin/V8` (pushed) | `4c62fe3fbf289fe649d271099aa048ea7f1c33cf` |

---

## 5. Hosted SHA

| Host | `/healthz` | Hosted `gitSha` | Match intended? |
|------|------------|-----------------|-----------------|
| `neuniversity.org` | **200** | `d9ac720d1b02` | **No** (stale) |
| `blessboard.neuniversity.org` | **200** | `d9ac720d1b02` | **No** |
| `activeclinic.neuniversity.org` | **200** | `d9ac720d1b02` | **No** |

Health JSON (all three V8 hosts, stale build):

- `deploymentCode=moovex-platform-v8-testing`  
- `environment=testing`  
- `platformLine=v8`  
- `expectedIdentityKey=moovex-platform-v7`  
- `schemaCompatible=true`  

---

## 6. Homepage verification (`https://neuniversity.org/`)

| Check | Result |
|-------|--------|
| HTTP 200 | **Yes** |
| Heading Moovex Platform V8 QA | **Yes** (brand already on prior build) |
| Subtitle Version 2.0 Development and Testing | **No** — still “Testing platform hub on pronline.org…” |
| BlessBoard V2.0 only + ActiveClinic V2.0 only | **No** — still shows V7, V8, GetPro, Netraz |
| No `pronline.org` application links | **No** — still present |
| Platform health-check link | **Yes** |

**Hosted hub: FAIL for Version 2.0-only requirement** until SHA `4c62fe3f…` is deployed.

---

## 7. BlessBoard V2.0 verification

| URL | Status | Notes |
|-----|--------|-------|
| `https://blessboard.neuniversity.org/` | **200** | BlessBoard home |
| `https://blessboard.neuniversity.org/healthz` | **200** | V8 profile OK; SHA stale |
| `https://blessboard.neuniversity.org/about` | **200** | Displays **Version 2.0** (already on `d9ac720d`) |

---

## 8. ActiveClinic V2.0 verification

| URL | Status | Notes |
|-----|--------|-------|
| `https://activeclinic.neuniversity.org/` | **200** | ActiveClinic home |
| `https://activeclinic.neuniversity.org/healthz` | **200** | V8 profile OK; SHA stale |
| `https://activeclinic.neuniversity.org/about` | **200** | Displays **Version 2.0** |

---

## 9. V7 compatibility verification

| Check | Result |
|-------|--------|
| `https://pronline.org/` | **200** — still “Moovex Platform QA” with full matrix (GetPro/Netraz/V7/V8 links); **not** Version 2.0-only |
| `https://blessboard.pronline.org/healthz` | **200** — `deploymentCode=moovex-platform-testing`, `gitSha=03a89106e2fe`, `schemaCompatible=true` |
| `https://activeclinic.pronline.org/healthz` | **200** — same V7 testing deployment |
| Local V7 hub regression | **15/15 pass** |

V7 QA on pronline.org was **not** modified by this change set.

---

## 10. Production untouched confirmation

| Check | Result |
|-------|--------|
| `https://blessboard.com/healthz` | **200** — `deploymentCode=moovex-platform-production`, `environment=production`, `gitSha=d4f5b190074d` |
| Production deploy / env / DB | **Not performed** |
| Shared database | **Not migrated / not altered** |

---

## Blocker / required Hostinger action

1. In **hPanel**, Deploy/Restart the **V8-only** Node app on branch `V8` so workers load commit **`4c62fe3fbf289fe649d271099aa048ea7f1c33cf`**.  
2. Confirm `/healthz` `gitSha` matches that commit (prefix `4c62fe3f…`).  
3. Re-fetch `https://neuniversity.org/` and confirm:
   - Subtitle **Version 2.0 Development and Testing**
   - Only **BlessBoard V2.0** → `https://blessboard.neuniversity.org/`
   - Only **ActiveClinic V2.0** → `https://activeclinic.neuniversity.org/`
   - No `pronline.org` / GetPro / Netraz / V7 cards  
4. Do **not** restart or rebind V7 `*.pronline.org` or production.

Cursor cannot perform Hostinger Deploy from this environment.

---

## Final status

**`V8_QA_HOMEPAGE_V2_ONLY_BLOCKED`**

Reason: intended commit is on `origin/V8`, automated gates pass, V7/production untouched, but hosted V8 still runs `d9ac720d…` and the live hub is not Version 2.0-only.
