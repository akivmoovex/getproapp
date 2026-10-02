# V8 QA Homepage — Version 2.0 only

**Recorded:** 2026-09-20  
**Branch:** `V8`  
**Priority:** P1  
**Final status:** `V8_QA_HOMEPAGE_V2_ONLY_PASS`

**Hosted verification (Prompt 10):** local `HEAD`, `origin/V8`, and all V8 `/healthz` hosts matched **`01a4759655e72a1fd1ea2a9cc4c93fc59270b6f3`**.  
`https://neuniversity.org/` returns **200** and displays **only** BlessBoard V2.0 and ActiveClinic V2.0.

---

## 1. Changed files

| File | Change |
|------|--------|
| `src/platform/http/moovexPlatformRuntimeServer.js` | Platform-line-aware QA launcher: V8 hub = Moovex Platform V8 QA + Version 2.0 subtitle + BlessBoard/ActiveClinic V2.0 cards from deployment `apexDomains`; V7 hub matrix unchanged; www hub redirect generalized; hub-only 404 message domain-aware |
| `tests/v8-qa-homepage-v2-only.test.js` | Regression for all 10 required checks + www redirect |
| `scripts/v8/suite-manifest.js` | Wire test into shared-platform + compatibility suites |
| `scripts/v8/run-coverage.js` | Include new test in coverage file list |
| `docs/releases/V8_QA_HOMEPAGE_VERSION_2_ONLY.md` | This report (updated after hosted PASS) |

**Not changed:** V7 deployment profiles, shared DB identity (`moovex-platform-v7` / `testing`), product routes, production.

Implementation commit: `4c62fe3fbf289fe649d271099aa048ea7f1c33cf`  
Docs (prior blocked report) + tip at hosted PASS: `01a4759655e72a1fd1ea2a9cc4c93fc59270b6f3`

---

## 2. Automated test results

### Prompt 09 full regression (pre-deploy)

| Gate | Passed | Failed | Skipped |
|------|--------|--------|---------|
| `tests/v8-qa-homepage-v2-only.test.js` | **9** | **0** | **0** |
| shared-platform | **343** | **0** | **0** |
| compatibility | **258** | **0** | **0** |
| blessboard | **241** | **0** | **0** |
| activeclinic | **104** | **0** | **0** |
| **Full regression total** | **946** | **0** | **0** |

### Prompt 10 re-run (final verification)

| Gate | Passed | Failed | Skipped |
|------|--------|--------|---------|
| `tests/v8-qa-homepage-v2-only.test.js` + `tests/v7-hostinger-testing-runtime.test.js` | **24** | **0** | **0** |
| `npm run test:v8:suite -- shared-platform` | **343** | **0** | **0** |

Overall automated: **PASS**.

---

## 3. Coverage for modified code

`moovexPlatformRuntimeServer.js` remains a **justified exclusion** from the 90% line gate. New hub behavior is covered by `tests/v8-qa-homepage-v2-only.test.js`.

---

## 4. V8 commit SHA (at hosted PASS)

| Ref | SHA |
|-----|-----|
| Local `HEAD` | `01a4759655e72a1fd1ea2a9cc4c93fc59270b6f3` |
| `origin/V8` | `01a4759655e72a1fd1ea2a9cc4c93fc59270b6f3` |
| Match | **Yes** |

---

## 5. Hosted SHA

| Host | `/healthz` | Hosted `gitSha` | Matches intended? |
|------|------------|-----------------|-------------------|
| `neuniversity.org` | **200** | `01a4759655e7` | **Yes** |
| `blessboard.neuniversity.org` | **200** | `01a4759655e7` | **Yes** |
| `activeclinic.neuniversity.org` | **200** | `01a4759655e7` | **Yes** |

Health JSON (all three):

- `deploymentCode=moovex-platform-v8-testing`
- `environment=testing`
- `platformLine=v8`
- `expectedIdentityKey=moovex-platform-v7`
- `schemaCompatible=true`
- `ok=true`

---

## 6. Homepage verification (`https://neuniversity.org/`)

| Check | Result |
|-------|--------|
| HTTP 200 | **Pass** |
| Heading `Moovex Platform V8 QA` | **Pass** |
| Subtitle `Version 2.0 Development and Testing` | **Pass** |
| `data-platform-line="v8"` | **Pass** |
| BlessBoard V2.0 → `https://blessboard.neuniversity.org/` | **Pass** |
| ActiveClinic V2.0 → `https://activeclinic.neuniversity.org/` | **Pass** |
| Only those two application links | **Pass** |
| No `pronline.org` | **Pass** |
| No V7 labels | **Pass** |
| No GetPro / Netraz | **Pass** |
| No Version 1.x | **Pass** |
| Platform health-check `/healthz` | **Pass** |

---

## 7. BlessBoard V2.0 verification

| URL | Status | Notes |
|-----|--------|-------|
| `https://blessboard.neuniversity.org/` | **200** | Product home |
| `https://blessboard.neuniversity.org/healthz` | **200** | V8 identity + SHA match |
| `https://blessboard.neuniversity.org/about` | **200** | Displays **Version 2.0** |

---

## 8. ActiveClinic V2.0 verification

| URL | Status | Notes |
|-----|--------|-------|
| `https://activeclinic.neuniversity.org/` | **200** | Product home |
| `https://activeclinic.neuniversity.org/healthz` | **200** | V8 identity + SHA match |
| `https://activeclinic.neuniversity.org/about` | **200** | Displays **Version 2.0** |

---

## 9. V7 compatibility verification

| Check | Result |
|-------|--------|
| `https://pronline.org/` | **200** — still “Moovex Platform QA” with full matrix (includes GetPro); **not** Version 2.0-only |
| `https://blessboard.pronline.org/healthz` | **200** — `moovex-platform-testing`, `gitSha=03a89106e2fe`, `schemaCompatible=true` |
| `https://activeclinic.pronline.org/healthz` | **200** — same V7 testing deployment |
| Local V7 hub tests | **Pass** (included in Prompt 10 24/24) |

---

## 10. Production untouched confirmation

| Check | Result |
|-------|--------|
| `https://blessboard.com/healthz` | **200** — `moovex-platform-production` / `production` / `gitSha=d4f5b190074d` |
| Production deploy / env / DB | **Not performed** |
| Shared database | **Not migrated / not altered** |

---

## Remaining blockers

None for this objective.

---

## Final status

**`V8_QA_HOMEPAGE_V2_ONLY_PASS`**
