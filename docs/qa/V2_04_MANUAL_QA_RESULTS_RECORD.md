# V2.04 Manual QA — Results Record

**Mode:** RESULT INGESTION (no application code; no deploy; PRODUCTION untouched).  
**Date:** 2026-10-02  
**Frozen application candidate:** `2a2498f630676638c63f1961f0c8bf80507a15c5`  
**Hosted tip (SHA gate):** Hub/AC/BB `gitSha=2a2498f63067`, `branch=V4`  
**TESTING DB:** PLATFORM_MIGRATION=047 · BB_MIGRATION=122 · PENDING_MIGRATIONS=0  
**Tenants:** BB `bb-v8qa-muq9wn7a9a3d` · AC `ac-hqa-v8-muq9wn7a9a3d`

### Final hosted release-candidate retest — **EXECUTED** (2026-10-02)

| Host | SHA | BRANCH |
|------|-----|--------|
| `neuniversity.org` | `2a2498f63067` | V4 |
| `activeclinic.neuniversity.org` | `2a2498f63067` | V4 |
| `blessboard.neuniversity.org` | `2a2498f63067` | V4 |

- **HOSTED_SHA_MATCH=PASS** vs `2a2498f630676638c63f1961f0c8bf80507a15c5`
- **HOSTED_BRANCH_PARITY=PASS**
- **POST_DEPLOY_SMOKE=PASS** (AC/BB login 200; AC `/app/settings/website` 200; BB `/hq/website` 200; public AC/BB 200 after publish)
- **AC_WEBSITE_OPTIONS_HOSTED=12/12** · **BB_WEBSITE_OPTIONS_HOSTED=12/12** (BB hub tile parity branding/library/settings = true)
- **RB-QA-01=OPEN** (Members: PASS=4 · FAIL=3 · NOT_RUN=7)
- **RB-QA-02=OPEN** (AC lifecycle PASS including restore; BB lifecycle mostly PASS; **BB RESTORE-AS-NEW FAIL**)
- RB-QA-03/04/05 / RB-ID-01 not reopened · RB-QA-04 not reopened
- Evidence: `docs/qa/references/v2-04-final-hosted-rc-retest-evidence.json`, `…-deep-evidence.json`, `…-deep2-evidence.json`

### Prior: Final hosted release-candidate retest — **STOP** (2026-10-02)

| Host | SHA | BRANCH |
|------|-----|--------|
| `neuniversity.org` | `551526acfb0a` | V4 |
| `activeclinic.neuniversity.org` | `551526acfb0a` | V4 |
| `blessboard.neuniversity.org` | `551526acfb0a` | V4 |

- **Required candidate:** `2a2498f630676638c63f1961f0c8bf80507a15c5`
- **HOSTED_SHA_MATCH=FAIL** (hosted is prior DOC_ONLY tip `551526acfb0a`; missing consolidation commit `2a2498f6`)
- Superseded by EXECUTED retest above after deploy of `2a2498f6…`

### Hosted tip one-commit reconciliation (2026-10-02) — **CASE A / FREEZE**

| Item | Result |
|------|--------|
| PREVIOUS_CANDIDATE | `600d1c07cfea3b287455226ab50d623809fa2ea8` |
| HOSTED_SHA | `7ae27d6631e6` (`7ae27d6631e6cd46332491d3b9315969aeb6f279`) |
| PREVIOUS_IS_ANCESTOR | YES |
| INTERVENING_COMMITS | 1 |
| COMMIT_CLASS | **DOC_ONLY** (2 QA markdown files only) |
| APPLICATION_DELTA | **NO** |
| REQUIRED_FIXES_PRESENT | **YES** |
| SAFE_TO_FREEZE_HOSTED_SHA | **YES** |
| NEW_APPLICATION_CANDIDATE | `7ae27d6631e6cd46332491d3b9315969aeb6f279` |
| REDEPLOY_REQUIRED | **NO** |

Next: rerun final blocker QA with exact-SHA gate against `7ae27d6631e6`.

### Post-deploy SHA gate — **STOP** (2026-10-02)

| Host | SHA | BRANCH |
|------|-----|--------|
| `neuniversity.org` | `7ae27d6631e6` | V4 |
| `activeclinic.neuniversity.org` | `7ae27d6631e6` | V4 |
| `blessboard.neuniversity.org` | `7ae27d6631e6` | V4 |

- **HOSTED_SHA_MATCH=FAIL** vs required exact `600d1c07cfea3b287455226ab50d623809fa2ea8`
- **HOSTED_BRANCH_PARITY=PASS** (all V4)
- `600d1c07` is an ancestor of hosted tip `7ae27d66` (one later commit), but gate requires exact SHA
- **Steps 2–6 functional QA NOT RUN**

### Prior ingestion finding (older tip; unchanged)

Final-3 manual blockers executed on hosted tip.  
**RB-QA-04=PASS** (disabled-country POST + engine true-stale on BB+AC).  
**RB-QA-01=OPEN** (Members pack blocked by `/hq/members` **503**).  
**RB-QA-02=OPEN** (BB publish readiness `not_ready`; AC public clinic **403** after publish).  
Prior closed: **RB-QA-03=PASS**, **RB-QA-05=PASS**, **RB-ID-01=PASS**.

Evidence refs:
- `docs/qa/references/v2-04-bb-members-scenario-probe-evidence.json`
- `docs/qa/references/v2-04-bb-website-lifecycle-evidence.json`
- `docs/qa/references/v2-04-bb-true-stale-engine-evidence.json`
- `docs/qa/references/v2-04-ac-website-lifecycle-evidence.json`
- `docs/qa/references/v2-04-disabled-country-post-evidence.json`

---

## Results

| QA_ID | RESULT | TESTER_EVIDENCE | DEFECT_ID | NOTES |
|-------|--------|-----------------|-----------|-------|
| RB-QA-01 | **OPEN** | Hosted `@2a2498f63067`: T-M02/T-M13 **PASS** (no 503); T-M14/T-M15 **PASS**; T-M03/T-M04/T-M08 **FAIL**; others NOT_RUN | DEF-BB-ADD-MEMBER-BRANCH-ID; DEF-BB-MEMBER-PORTAL-ROUTES | Prior DEF-BB-MEMBERS-503 **cleared** |
| RB-QA-02 | **OPEN** | BB publish/public/unpublish/republish/version preview **PASS**; BB restore **FAIL**; AC lifecycle incl. save/public/restore **PASS**; responsive 768/390 **PASS** | DEF-BB-WEBSITE-RESTORE | Prior publish/403 defects **cleared** |
| RB-QA-03 | **PASS** | Prior hosted resume; smoke reconfirmed | — | Unchanged |
| RB-QA-04 | **PASS** | Prior PASS; not reopened this run | — | No concurrency regression observed during lifecycle |
| RB-QA-05 | **PASS** | Prior hosted resume | — | Unchanged |

### Failures / new defects from this execution

| ID | Severity | Summary |
|----|----------|---------|
| DEF-BB-ADD-MEMBER-BRANCH-ID | **P0** | `/branch-admin/members/new` renders `branch_id` options with empty `value=""`; POST 400 “Assigned branch is required” — blocks T-M03 |
| DEF-BB-MEMBER-PORTAL-ROUTES | **P0** | `/member/login` + `/member/activate` → **404**; `/member` → **503** V5 unavailable — blocks T-M04/T-M08 |
| DEF-BB-WEBSITE-RESTORE | **P1** | HQ version restore → 400 “This version cannot be restored” for listed published versions |
| ~~DEF-BB-MEMBERS-503~~ | — | **CLEARED** on `2a2498f63067` — `/hq/members` 200 |
| ~~DEF-BB-WEB-PUBLISH-NOT-READY~~ | — | **CLEARED** — publish success; public leaves Coming soon |
| ~~DEF-AC-PUBLIC-403~~ | — | **CLEARED** — unauth clinic **200** after publish+makePublic |
| DEF-BB-INLINE-STALE-SILENT | P2 | Classic inline-field silent overwrite (engine path 409) — prior; not reopened |

---

## RB-QA-01 — BlessBoard Members scenarios (T-M02–T-M15)

| TEST_ID | RESULT | EVIDENCE |
|---------|--------|----------|
| T-M02 | **PASS** | HQ `/hq/members` **200** (no 503); empty catalog OK; registrations **200**; branch `/branch-admin/members` **200** + Add Member href; primary V2.04 list query works |
| T-M03 | **FAIL** | Add Member form **200**; POST blocked — all `branch_id` options have empty values; validation “Assigned branch is required” |
| T-M04 | **FAIL** | `/member/login` **404**; `/member/activate` **404**; provisioned member email login remains **401** on `/login` |
| T-M05 | **NOT_RUN** | Member recovery/OTP not exercised (portal auth routes missing); staff `/forgot-password` **200** only |
| T-M06 | **NOT_RUN** | Lost Church ID admin-assisted path not exercised |
| T-M07 | **NOT_RUN** | Profile/block/unblock not executed (no created member after T-M03 fail); member-journey page **200** |
| T-M08 | **FAIL** | Dual-role: HQ session `/member` → **503** “not yet available in BlessBoard V5” |
| T-M09 | **NOT_RUN** | Attendance page **200**; manual/QR/duplicate/correction flows not executed |
| T-M10 | **NOT_RUN** | Requests page **200**; approve/reject/self-approve not executed |
| T-M11 | **NOT_RUN** | Member privacy spot-check not executed (no member portal session) |
| T-M12 | **NOT_RUN** | Member portal upload not executed (`/member` 503) |
| T-M13 | **PASS** | Admin search `/hq/members?q=test` **200** (no 503) |
| T-M14 | **PASS** | HQ + reviewer login OK; `/hq/settings/staff-access` + `/hq/roles` + `/hq/audit` **200**; branch admin **403** on `/hq/members` |
| T-M15 | **PASS** | Cross-tenant: BB `/c/{AC_ORG}/hq` **404**; AC `/clinics/{BB_ORG}` **404** |

**Counts (@ `2a2498f63067`):** PASS=4 · FAIL=3 · NOT_RUN=7  
Cells deferred functionality was not treated as failure.

---

## RB-QA-02 — Shared website lifecycle

### BlessBoard (@ `2a2498f63067`)

| Step | Result | Evidence |
|------|--------|----------|
| DRAFT open | PASS | Edit Website opens draft editor with viewport chrome |
| SAVE | PASS | `POST /c/{org}/website/drafts` → 200 `saved_to_draft` |
| PREVIEW | PASS | Preview route **200** |
| PUBLISH | PASS | `POST /hq/website/publish` → `/publish/success?version=…` (no `not_ready`) |
| PUBLIC VERIFY | PASS | Unauth `/c/{org}` **200**, title live church name (not Coming soon) |
| UNPUBLISH | PASS | `notice=unpublished` |
| VERSION HISTORY | PASS | History lists published versions |
| OLD VERSION PREVIEW | PASS | Historical Version Preview **200** + governance banner |
| RESTORE-AS-NEW | **FAIL** | `/hq/website/version-history/{id}/restore` → 400 “This version cannot be restored” |
| REPUBLISH | PASS | Publish success again (no `not_ready`) |
| RESPONSIVE | PASS | Desktop/Tablet/Mobile + 768/390 frame markers present |
| TRUE STALE | PASS | Prior RB-QA-04; not reopened |

**BB_WEBSITE_LIFECYCLE=FAIL** (restore-as-new)

### ActiveClinic (@ `2a2498f63067`)

| Step | Result | Evidence |
|------|--------|----------|
| DRAFT/SAVE | PASS | `POST /clinics/.../website/drafts` JSON/form → 200 `saved_to_draft` |
| PREVIEW | PASS | Preview **200** |
| PUBLISH | PASS | `website=published` with `makePublic=1` |
| PUBLIC VERIFY | PASS | Unauth `/clinics/{key}` **200** (no Clinic unavailable) |
| UNPUBLISH | PASS | `website=unpublished` |
| VERSION HISTORY | PASS | History lists versions |
| OLD VERSION PREVIEW | PASS | Stitch/presentation content + version banner |
| RESTORE-AS-NEW | PASS | `POST .../versions/{id}/restore` → `restored_draft` |
| REPUBLISH | PASS | Public **200** after republish |
| STAFF PROTECTED | PASS | Unauth `/app/settings/website` redirects to login |
| RESPONSIVE | PASS | Desktop/Tablet/Mobile + 768/390 |
| TRUE STALE | PASS | Prior RB-QA-04; not reopened |

**AC_WEBSITE_LIFECYCLE=PASS**  
**TRUE_STALE_WEBSITE=PASS** (prior; not reopened)
---

## RB-QA-04 — Disabled country + concurrency

### A. Disabled country POST

| Product | Result | Evidence |
|---------|--------|----------|
| BB `/register-church` forged `country=FR` | PASS | HTTP **400**; FR not in enabled UI list; no success redirect; slug probe 404 |
| AC `/register-clinic` forged `countryCode=FR` | PASS | HTTP **400**; “Select a valid country.”; no success; slug probe 404 |

**DISABLED_COUNTRY_POST=PASS**

### B. True stale concurrency

| Product | Result | Evidence |
|---------|--------|----------|
| BB engine drafts | PASS | 200 then **409** `conflict/stale_draft_revision` |
| AC engine drafts | PASS | 200 then **409** `conflict/stale_draft_revision` |

**TRUE_STALE_CONCURRENCY=PASS**

---

```
MANUAL_QA_INPUT=5
MANUAL_QA_PASS=3
MANUAL_QA_FAIL=0
MANUAL_QA_BLOCKED=0
MANUAL_QA_NOT_RUN=0
MANUAL_QA_OPEN=2
MANUAL_QA_REMAINING=2
NEW_RELEASE_BLOCKERS=2
NEW_DEFECTS=3
FROZEN_CANDIDATE=7dbe945d6c9315cbe6c6a45c7a64ee354a2fe22b
HOSTED_SHA_MATCH=PASS
RB_QA_01=OPEN
RB_QA_02=OPEN
RB_QA_03=PASS
RB_QA_04=PASS
RB_QA_05=PASS
REMAINING_BLOCKERS=2
FINAL=V2_04_FINAL_MANUAL_QA_BLOCKERS_EXECUTED
```
