# V2.04 Color Theme — Hosted QA Gate

**Status:** `HOSTED_DEPLOYMENT_STALE` · `V2_04_COLOR_THEME_HOSTED_QA_BLOCKED`  
**Version:** 2.04  
**Gate:** `HOSTED_COLOR_THEME_QA`  
**Branch (local):** V4  
**Date:** 2026-09-29  
**Production:** UNTOUCHED  

## 1. Objective

Promote `origin/V4` HEAD to **testing only** (`moovex-platform-testing` / pronline.org), then run narrow BB + AC hosted color-theme verification.

This gate did **not** modify color architecture, database, migrations, V10, or production.

## 2. Pre-deploy local verification

| Check | Result |
| --- | --- |
| `BRANCH` | **V4** |
| `LOCAL_V4_HEAD` | `c2a94cc2f13b503aebb8416d4f0836c23e7b9bca` |
| `origin/V4` | `c2a94cc2f13b503aebb8416d4f0836c23e7b9bca` |
| `HEAD == origin/V4` | **PASS** |
| Theme candidate ancestor `19c116d9…` | **PASS** (`THEME_CANDIDATE_ANCESTOR=PASS`) |
| Post-candidate delta | **docs only** → `docs/qa/V2_04_COLOR_THEME_FINAL_QA.md` |
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
| Expected deploy SHA | `c2a94cc2f13b503aebb8416d4f0836c23e7b9bca` (hosted 12: `c2a94cc2f13b`) |
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
  --expected-sha c2a94cc2f13b503aebb8416d4f0836c23e7b9bca
```

Expect both healthz hosts: `gitSha=c2a94cc2f13b`, `branch=V4`, `displayLabel=V4 testing`, `environment=testing`, `deploymentCode=moovex-platform-testing`.

## 5. Hosted build identity (current — stale)

Read-only `/healthz` after pre-deploy checks:

| Host | HTTP | environment | deploymentCode | branch | displayLabel | gitSha (12) |
| --- | ---: | --- | --- | --- | --- | --- |
| `https://blessboard.pronline.org/healthz` | 200 | testing | moovex-platform-testing | **V10** | **V10 testing** | **`05b2afe1caff`** |
| `https://activeclinic.pronline.org/healthz` | 200 | testing | moovex-platform-testing | **V10** | **V10 testing** | **`05b2afe1caff`** |

`deploy:check-testing-sha` / `node scripts/check-hosted-testing-sha.js --expected-sha c2a94cc2…` → **`ok: false`**, classification **`DEPLOY_DRIFT`** on both hosts.

| Field | BB | AC |
| --- | --- | --- |
| `HOSTED_BRANCH` | V10 | V10 |
| `HOSTED_LABEL` | V10 testing | V10 testing |
| `HOSTED_SHA` | `05b2afe1caff` | `05b2afe1caff` |
| `ENVIRONMENT` | testing | testing |
| `THEME_CANDIDATE_PRESENT` | **FAIL** (deployed tip predates / is not V4 candidate line) | same |

| Gate field | Result |
| --- | --- |
| `BB_HOSTED_SHA` | `05b2afe1caff` |
| `AC_HOSTED_SHA` | `05b2afe1caff` |
| `SHA_PARITY` | **PASS** (both identical, but **wrong** tip) |
| `DEPLOYED_SHA` | `05b2afe1caff` (**stale** vs expected `c2a94cc2f13b`) |
| `HOSTED_DEPLOYMENT_STALE` | **YES** |

Per gate rules §8: **STOP visual QA** when hosted SHA remains `05b2afe1caff`.

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
| `HOSTED_BRANCH` expected V4 | **FAIL** (observed V10) |
| `HOSTED_SHA` matches `origin/V4` | **FAIL** |
| Final | **`V2_04_COLOR_THEME_HOSTED_QA_BLOCKED`** |

### Resume after operator deploy

1. Confirm healthz identity matches §4 expectations.  
2. Resume gate from §8 onward (route health → theme stylesheet → BB/AC smoke → isolation → responsive → logs).  
3. Update this file + `V2_04_COLOR_THEME_FINAL_QA.md` with PASS evidence.  
4. Docs-only commit: `docs(v2.04): record hosted color theme QA`.
