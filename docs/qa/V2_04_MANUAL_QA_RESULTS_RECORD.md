# V2.04 Manual QA — Results Record

**Mode:** RESULT INGESTION (no application code; no deploy).  
**Date:** 2026-10-02  
**Frozen application candidate (reconciled):** `7ae27d6631e6cd46332491d3b9315969aeb6f279`  
**Previous candidate:** `600d1c07cfea3b287455226ab50d623809fa2ea8`  
**Hosted tip (SHA gate):** Hub/AC/BB `gitSha=7ae27d6631e6`, `branch=V4` / About `V4 testing`  
**Prior frozen tip on record:** `7dbe945d6c9315cbe6c6a45c7a64ee354a2fe22b`  
**Tenants:** BB `bb-v8qa-muq9wn7a9a3d` · AC `ac-hqa-v8-muq9wn7a9a3d`


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
| RB-QA-01 | **OPEN** | Post-deploy retest **STOP** (SHA gate). Prior: T-M02–T-M15; `/hq/members` **503** | DEF-BB-MEMBERS-503 | Exact `600d1c07…` not hosted; functional suite not re-run |
| RB-QA-02 | **OPEN** | Post-deploy retest **STOP** (SHA gate). Prior: BB `not_ready`; AC public **403** | DEF-BB-WEB-PUBLISH-NOT-READY; DEF-AC-PUBLIC-403 | Exact `600d1c07…` not hosted; lifecycle not re-run |
| RB-QA-03 | **PASS** | Prior hosted resume | — | Unchanged |
| RB-QA-04 | **PASS** | BB+AC forged `FR` registration POST **400**; AC text includes “Select a valid country.”; slug probes **404**. Engine stale: first save 200, stale second **409** `conflict/stale_draft_revision` on BB+AC; newer retained. | — | Classic BB `/hq/content/api/inline-field` lacks `expectedUpdatedAt` (silent overwrite) — engine path is canonical concurrency surface |
| RB-QA-05 | **PASS** | Prior hosted resume | — | Unchanged |

### Failures / new defects from this execution

| ID | Severity | Summary |
|----|----------|---------|
| DEF-BB-MEMBERS-503 | **P0** | HQ/branch members list returns 503; blocks T-M02/T-M13 and dependent member admin flows |
| DEF-BB-WEB-PUBLISH-NOT-READY | **P0** | Publish readiness remains `not_ready` after contact + service-times + settings fills; public never leaves Coming soon; version history has no published versions |
| DEF-AC-PUBLIC-403 | **P0** | After website publish (`notice=published`), unauthenticated `/clinics/{key}` (+ services/doctors/contact) returns **403 Clinic unavailable** |
| DEF-BB-INLINE-STALE-SILENT | P2 | Classic inline-field dual-session overwrite without revision token (engine path correctly 409) |

---

## RB-QA-01 — BlessBoard Members scenarios (T-M02–T-M15)

| TEST_ID | RESULT | EVIDENCE |
|---------|--------|----------|
| T-M02 | **FAIL** | Staff HQ `/hq/members` → **503** Members temporarily unavailable. Registrations oversight **200** but member create/list path blocked. |
| T-M03 | **NOT_RUN** | Blocked by members 503 / no Church ID create surface |
| T-M04 | **FAIL** | Visitor + member applicant login → **401**. No activation/login success path on provisioned member personas. |
| T-M05 | **NOT_RUN** | Recovery/OTP not exercised (no activated member session) |
| T-M06 | **NOT_RUN** | Lost Church ID admin-assisted path not exercised |
| T-M07 | **FAIL** | Member profile/block requires members admin; `/hq/members` 503. Member journey page loads (**200**) but profile/block/unblock not executed. |
| T-M08 | **NOT_RUN** | Dual-role journey not executed (no dual-role member session) |
| T-M09 | **NOT_RUN** | Attendance page **200**; manual/QR/duplicate/correction flows not executed |
| T-M10 | **NOT_RUN** | Requests page **200**; approve/reject/self-approve not executed |
| T-M11 | **NOT_RUN** | Member privacy spot-check not executed (no member portal session) |
| T-M12 | **NOT_RUN** | Member portal upload attempt not executed (`/member` 503 earlier; `/member/register` V5 unavailable) |
| T-M13 | **FAIL** | Admin search `/hq/members?q=test` → **503** |
| T-M14 | **PASS** | Multi-admin: HQ + reviewer login OK; staff-access + roles **200**. Branch admin **403** on `/hq/members` (“no access”). Scoped HQ denial evidenced. |
| T-M15 | **PASS** | Cross-tenant: BB `/c/{AC_ORG_KEY}/hq` → **404** Not found. AC `/clinics/{BB_ORG_KEY}` → **404**. |

**Counts (prior tip):** PASS=2 · FAIL=4 · NOT_RUN=8  
**This post-deploy attempt:** PASS=0 · FAIL=0 · NOT_RUN=14 (SHA gate stop)  
Cells deferred functionality was not treated as failure.

---

## RB-QA-02 — Shared website lifecycle

### BlessBoard

| Step | Result | Evidence |
|------|--------|----------|
| DRAFT open | PASS | Editor draft chrome; unpublished changes include engine keys |
| SAVE | PASS | Engine `POST .../hq/website/drafts` `home.hero.heading` → 200 `saved_to_draft` |
| PREVIEW | PASS | Draft preview shows stamped heading |
| PUBLISH | **FAIL** | `POST /hq/website/publish` → `error=not_ready` (details/contact/status checklist remains Needs Attention despite fills) |
| PUBLIC VERIFY | **FAIL** | `/c/{org}/hq` remains Coming soon |
| UNPUBLISH | PARTIAL | `POST /hq/website/unpublish` → `notice=unpublished` (site already unpublished) |
| VERSION HISTORY | **FAIL** | “No published versions yet” after attempted publish |
| RESTORE-AS-NEW | **NOT_RUN** | No published version ids to restore |
| REPUBLISH | **FAIL** | Same `not_ready` |
| TRUE STALE | **PASS** | Two HQ sessions; B save 200; A stale save **409** `stale_draft_revision`; draft retains newer |

**BB_WEBSITE_LIFECYCLE=FAIL**

### ActiveClinic

| Step | Result | Evidence |
|------|--------|----------|
| DRAFT/SAVE | PASS | `home.hero.title` draft save 200 |
| PREVIEW | PASS | Draft stamp visible when authenticated |
| PUBLISH | PASS | `POST /clinics/.../website/publish` → `history?notice=published` |
| PUBLIC VERIFY | **FAIL** | Unauthenticated `/clinics/{key}` **403 Clinic unavailable** (also services/doctors/contact) |
| UNPUBLISH | PASS | `POST .../website/unpublish` → `website=unpublished` |
| VERSION HISTORY | PASS | History HTML lists versions |
| RESTORE-AS-NEW | PASS | `POST .../versions/{id}/restore` → `notice=restored_draft` |
| REPUBLISH | PASS | Publish again → `notice=published` |
| TRUE STALE | **PASS** | B 200; A **409** `stale_draft_revision`; newer retained |
| Cross-tenant | PASS | BB org key on AC → 404 |

**AC_WEBSITE_LIFECYCLE=FAIL** (public verify broken)  
**TRUE_STALE_WEBSITE=PASS**

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
