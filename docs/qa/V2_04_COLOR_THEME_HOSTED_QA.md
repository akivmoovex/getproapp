# V2.04 Color Theme — Hosted QA Gate

**Status:** AC alias scope hotfix landed · **hosted re-smoke pending neuniversity redeploy**  
**Gate:** `FINAL_HOSTED_COLOR_THEME_SMOKE` (blocked on AC violet leak at `e06631f39027`)  
**Hotfix:** `docs/qa/V2_04_AC_THEME_ALIAS_SCOPE_HOTFIX.md`

## 1. Objective

Verify operator testing-only Hostinger deploy switched hosted identity from V10 → V4, then resume hosted BB + AC color-theme smoke only.

Verification only: **no** deploy, restart, env change, DB change, or application code change.

## 2. Pre-deploy local verification

| Check | Result |
| --- | --- |
| `BRANCH` | **V4** |
| `LOCAL_V4_HEAD` / `origin/V4` (retry) | `2a4e36e9705005ff23dd5fe67ef435244a353d5a` |
| Theme candidate ancestor `19c116d9…` | **PASS** (`THEME_CANDIDATE_ANCESTOR=PASS`) |
| Post-candidate delta | **docs only** → FINAL + HOSTED QA |
| `POST_CANDIDATE_APPLICATION_CHANGES` | **0** |

### Lightweight guards (re-confirmed)

| Metric | Expected | Observed |
| --- | ---: | ---: |
| `REPO_HARDCODED_COLORS` | 41 | **41** |
| `UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS` | 0 | **0** |
| `UNDEFINED_TOKENS` | 0 | **0** |
| `CIRCULAR_REFERENCES` | 0 | **0** |
| `COMPATIBILITY_ALIASES` | 0 | **0** |

Commands: `node --test tests/v2-04-color-migration-batch-8.test.js tests/v2-04-color-token-resolution.test.js` → **11/11 PASS**.  
Prior local final QA remains authoritative (`LOCAL_RELEASE_READINESS=PASS`).

## 3. Deployment target (confirmed)

| Field | Value |
| --- | --- |
| Deployment | `moovex-platform-testing` |
| Environment | `testing` |
| Domain family | pronline.org |
| Expected deploy SHA | `2a4e36e9705005ff23dd5fe67ef435244a353d5a` (hosted 12: `2a4e36e97050`) |
| Theme candidate (ancestor) | `19c116d90a9fcbbc3dd8314fed48b83c11505947` |
| Required branch identity | `GETPRO_GIT_BRANCH=V4` → labels **V4 testing** |

No changes were made to `DATABASE_URL`, DB identity, session secrets, media storage, or production configuration.

## 4. Deploy attempt — operator gate required

Hostinger testing has **no GitHub Actions auto-deploy**. Pushing `origin/V4` does not switch the running Node app off the currently configured **V10** Git branch.

This environment has **no Hostinger hPanel / SSH / API deploy credentials**. Therefore the testing worker was **not** restarted onto V4 from this gate.

### Operator sequence (testing only)

1. hPanel → Node.js → **moovex-platform-testing**  
2. Set Git branch to **`V4`** (repository `getproapp`)  
3. Set env **`GETPRO_GIT_BRANCH=V4`** (do not rely on `.git` metadata alone)  
4. **Deploy / Restart** the testing app only  
5. Do **not** restart production / blessboard.com / activeclinic.org  
6. Wait for worker stabilize, then:

```bash
node scripts/check-hosted-testing-sha.js \
  --expected-sha 2a4e36e9705005ff23dd5fe67ef435244a353d5a
```

Expect both healthz hosts: `gitSha=2a4e36e97050`, `branch=V4`, `displayLabel=V4 testing`, `environment=testing`, `deploymentCode=moovex-platform-testing`.

## 5. Hosted build identity

### 5a. Previous attempt (BLOCKED_STALE_V10)

Expected tip at first gate: `c2a94cc2f13b`. Observed both products: branch **V10**, label **V10 testing**, SHA **`05b2afe1caff`**.

### 5b. Retry identity probe (2026-09-29)

`CURRENT_ORIGIN_V4_SHA=2a4e36e9705005ff23dd5fe67ef435244a353d5a`  
`THEME_CANDIDATE_ANCESTOR=PASS` · `POST_CANDIDATE_APPLICATION_CHANGES=0` (docs only: FINAL + HOSTED QA).

Read-only `/healthz` on retry:

Read-only `/healthz` after pre-deploy checks:

| Host | HTTP | environment | deploymentCode | branch | displayLabel | gitSha (12) |
| --- | ---: | --- | --- | --- | --- | --- |
| `https://blessboard.pronline.org/healthz` | 200 | testing | moovex-platform-testing | **V10** | **V10 testing** | **`05b2afe1caff`** |
| `https://activeclinic.pronline.org/healthz` | 200 | testing | moovex-platform-testing | **V10** | **V10 testing** | **`05b2afe1caff`** |

`node scripts/check-hosted-testing-sha.js --expected-sha 2a4e36e9…` → **`ok: false`**, classification **`DEPLOY_DRIFT`** on both hosts.

| Field | BB | AC |
| --- | --- | --- |
| `HOSTED_BRANCH` | V10 | V10 |
| `HOSTED_LABEL` | V10 testing | V10 testing |
| `HOSTED_SHA` | `05b2afe1caff` | `05b2afe1caff` |
| `ENVIRONMENT` | testing | testing |
| `HOSTED_THEME_CANDIDATE_PRESENT` | **FAIL** | **FAIL** |

| Gate field | Result |
| --- | --- |
| `BB_HOSTED_SHA` | `05b2afe1caff` |
| `AC_HOSTED_SHA` | `05b2afe1caff` |
| `SHA_PARITY` | **PASS** (identical wrong tip) |
| `HOSTED_V4_IDENTITY` | **FAIL** |
| `DEPLOYED_SHA` | `05b2afe1caff` (**stale** vs expected `2a4e36e97050`) |
| `HOSTED_DEPLOYMENT_STALE` | **YES** |

Per retry gate §4: **STOP** — do not run visual smoke while V10 / `05b2afe1caff` remains.

## 6. Skipped hosted smoke (blocked by stale deploy)

| Check | Result | Reason |
| --- | --- | --- |
| `HOSTED_ROUTE_HEALTH` | **SKIPPED** | Wrong build tip |
| `BB_THEME_LOADED` | **SKIPPED** | Wrong build tip |
| `AC_THEME_LOADED` | **SKIPPED** | Wrong build tip |
| `HOSTED_BB_THEME_SMOKE` | **SKIPPED** | Wrong build tip |
| `HOSTED_AC_THEME_SMOKE` | **SKIPPED** | Wrong build tip |
| `HOSTED_BRAND_ISOLATION` | **SKIPPED** | Wrong build tip |
| `HOSTED_RESPONSIVE_THEME_SMOKE` | **SKIPPED** | Wrong build tip |
| `NEW_V2_04_THEME_ERRORS` | **N/A** (no V4 worker restart) | No V4 deploy to inspect |

Visual QA against V10 would be invalid evidence for V2.04 and was not performed.

## 7. Production safety

Read-only production `/healthz` (no deploy/restart/DB/media mutation):

| Host | environment | deploymentCode | gitSha (12) |
| --- | --- | --- | --- |
| blessboard.com | production | moovex-platform-production | `03a89106e2fe` |
| www.blessboard.com | production | moovex-platform-production | `03a89106e2fe` |
| activeclinic.org | production | moovex-platform-production | `03a89106e2fe` |
| www.activeclinic.org | production | moovex-platform-production | `03a89106e2fe` |

`PRODUCTION=UNTOUCHED`

## 8. Release verdict

| Gate | Result |
| --- | --- |
| `LOCAL_RELEASE_READINESS` | **PASS** |
| `HOSTED_RELEASE_READINESS` | **FAIL** (`HOSTED_DEPLOYMENT_STALE`) |
| `HOSTED_V4_IDENTITY` | **FAIL** (observed V10) |
| `HOSTED_SHA` matches `origin/V4` | **FAIL** |
| Final | **`V2_04_COLOR_THEME_HOSTED_QA_BLOCKED`** |

### Resume after operator deploy

1. Confirm both healthz hosts: `branch=V4`, `displayLabel=V4 testing`, `gitSha=2a4e36e97050` (or later docs-only descendant of theme candidate).  
2. Resume route health → theme stylesheet → BB/AC smoke → isolation → responsive → logs.  
3. Update this file + `V2_04_COLOR_THEME_FINAL_QA.md` with PASS evidence.  
4. Docs-only commit: `docs(v2.04): record successful hosted theme QA`.
