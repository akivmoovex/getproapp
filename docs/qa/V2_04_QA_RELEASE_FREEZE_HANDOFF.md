# V2.04 — QA Release Freeze + Handoff

**Status:** FINAL QA CLOSED · HOSTED GEOGRAPHY BLOCKER CLOSED · RELEASE_BLOCKERS=0  
**Date:** 2026-09-30  
**Branch:** `V4`  
**Gate:** `FINAL_QA_CLOSURE`

Supersedes Batch 8 local freeze handoff wording for **hosted final QA status**. The **frozen application candidate does not change**.

---

## 1. Authoritative release identity

| Field | Value |
| --- | --- |
| `FROZEN_APPLICATION_CANDIDATE` / `V2_04_HOSTED_QA_CANDIDATE` | `c16c791f9a4d102aa213debb3f4f0975c258c487` |
| Short SHA | `c16c791f9a4d` |
| `HOSTED_REPOSITORY_SHA` | `569712ad3ce3ff82ef5d5a8c9bfbd066544d5d2d` |
| Relationship | Hosted tip is a **docs-only** descendant of the frozen application candidate |
| `APPLICATION_TREE_PARITY` | **PASS** |
| `APP_PATH_DIFF_COUNT` | **0** |
| Branch | `V4` |
| Environment | `testing` / `moovex-platform-v8-testing` |
| Hosts | `blessboard.neuniversity.org`, `activeclinic.neuniversity.org` |

**Rule:** A later **docs-only** tip must **not** replace `V2_04_HOSTED_QA_CANDIDATE`. Only a newer **application** commit may supersede it. Do **not** redefine `569712ad…` as the application candidate.

---

## 2. Final hosted QA evidence (carried forward)

| Check | Result |
| --- | --- |
| `BB_ABOUT_VERSION` / `AC_ABOUT_VERSION` | **2.04** / **2.04** |
| `HOSTED_ASSET_VERSIONING` | **PASS** |
| `STALE_ASSET_REFERENCES` | **0** |
| `AC_PRIMARY_BRAND` | `#006068` |
| `BB_PRIMARY_BRAND` | `#6c5ce7` |
| `AC_PUBLIC_FONT` | **Inter** |
| `BB_TOKEN_LEAK_INTO_AC` / `AC_TOKEN_LEAK_INTO_BB` | **0** / **0** |
| `HOSTED_STITCH_PARITY` | **85.5** |
| `HOSTED_PUBLIC_PARITY` | **86.5** |
| `HOSTED_EDITOR_PARITY` | **79.8** |
| `HOSTED_HUB_PARITY` | **84.4** |
| `E01_STATUS` / `E02_STATUS` | **CLOSE** / **CLOSE** |
| `E01_E02_CLASSIFICATION` | **POST_QA_POLISH** |
| `FUTURE_CAPABILITY_COUNT` | **9** |
| `FALSE_ACTIVE_FUTURE_CONTROLS` | **0** |
| `H03_H06_BLOCKERS` | **0** |
| `BB_HOSTED_LIFECYCLE` / `AC_HOSTED_LIFECYCLE` | **PASS** / **PASS** |
| `BB_HOSTED_MEDIA` / `AC_HOSTED_MEDIA` | **PASS** / **PASS** |
| `BB_FALSE_CONFLICTS` / `AC_FALSE_CONFLICTS` | **0** / **0** |
| `BB_TRUE_STALE_REJECTION` / `AC_TRUE_STALE_REJECTION` | **PASS** / **PASS** |
| `HOSTED_AUTHORIZATION` | **PASS** |
| `HOSTED_TENANT_ISOLATION` | **PASS** |
| `HOSTED_CONCURRENCY` | **PASS** |

---

## 3. Geography blocker closure

| Field | Value |
| --- | --- |
| Pre-fix sole release blocker | `HOSTED_GEOGRAPHY=FAIL` |
| `ROOT_CAUSE` | **DATABASE_MIGRATION_MISSING** |
| Missing before fix | `044_city_catalogue.sql`, `045_registration_country_availability.sql` |
| Fix class | **CASE A** — apply existing approved migrations to **testing** only |
| Application-code change | **NONE** |
| `HOSTED_MIGRATION_044` | **APPLIED** |
| `HOSTED_MIGRATION_045` | **APPLIED** |
| `HOSTED_COUNTRY_RECORDS` | **19** |
| `HOSTED_CITY_RECORDS` | **516** |
| `HOSTED_GEOGRAPHY` | **PASS** |
| `BB_REGISTRATION` / `AC_REGISTRATION` | **PASS** / **PASS** |
| `GEOGRAPHY_AUTOTESTS` / BB / AC registration autotests | **PASS** / **PASS** / **PASS** |
| `GEOGRAPHY_CLEAN_BOOTSTRAP` | **PASS** |
| Focused closure tests | **PASSED=58** · **FAILED=0** |

Shared geography architecture (unchanged):

| Check | Value |
| --- | ---: |
| `SHARED_COUNTRY_SOURCE` | **1** |
| `SHARED_CITY_AUTOCOMPLETE_ENGINE` | **1** |
| `BB_PRODUCT_SPECIFIC_CITY_ENGINE` | **0** |
| `AC_PRODUCT_SPECIFIC_CITY_ENGINE` | **0** |

---

## 4. Architecture freeze (no further V2.04 architecture work)

| Engine | Count |
| --- | ---: |
| Editor | **1** |
| Upload | **1** |
| Media library | **1** |
| Draft | **1** |
| Publish | **1** |
| Version | **1** |
| Restore | **1** |

| Check | Value |
| --- | ---: |
| `LEGACY_BB_LIFECYCLE_RUNTIME_REFERENCES` | **0** |

---

## 5. Known non-blocking debt → V2.05 backlog

These are **not** V2.04 QA blockers (`RELEASE_BLOCKERS=0`):

1. E01/E02 editor visual chrome polish (`POST_QA_POLISH`).
2. Nine H03/H06 `FUTURE_CAPABILITY` controls (informational only; not false-active).
3. Remaining documented medium Stitch visual gaps.

Tracked in `docs/BACKLOG.md` under **V2.05 post-QA polish**.

---

## 6. Clean-DB evidence (preserved — do not re-wipe)

Source: `docs/qa/V2_04_BB_PLATFORM_ENGINE_MIGRATION.md`

| Check | Result |
| --- | --- |
| `CLEAN_DB_MIGRATION` | **PASS** |
| `BB_CLEAN_DB_E2E` | **PASS** |
| `AC_CLEAN_DB_E2E` | **PASS** |

Geography clean bootstrap additionally: `GEOGRAPHY_CLEAN_BOOTSTRAP=PASS` (canonical migrations/seed; no hosted-only ad-hoc data).

---

## 7. Theme + color-system evidence (still authoritative)

| Check | Value |
| --- | --- |
| AC primary | `#006068` |
| BB primary | `#6c5ce7` |
| Theme selectors | `[data-product="activeclinic"]` / `[data-product="blessboard"]` |
| Token leaks | BB→AC **0**, AC→BB **0** |
| AC public font (Stitch) | **Inter** |

Earlier freeze packet: `docs/qa/V2_04_COLOR_SYSTEM_FINAL_FREEZE.md`.

---

## 8. Control environments (read-only verification, 2026-09-30)

| Check | Result |
| --- | --- |
| `PRONLINE_BRANCH` | **V10** |
| Pronline BB/AC `healthz` | `branch=V10`, `gitSha=05b2afe1caff`, `moovex-platform-testing` |
| `PRONLINE_V10_PRESERVED` | **PASS** |
| Production BB/AC `healthz` | `environment=production`, `gitSha=03a89106e2fe`, `moovex-platform-production` |
| `PRODUCTION_UNTOUCHED` | **PASS** |
| Neuniversity BB/AC `healthz` | `moovex-platform-v8-testing`, `gitSha=569712ad3ce3` |

Do **not** deploy V2.04 to pronline. Do **not** touch production.

---

## 9. What this closure authorizes / forbids

**Authorized**

- Treat V2.04 hosted final QA as **closed** with `RELEASE_BLOCKERS=0`.
- Keep `c16c791f9a4d…` as the frozen **application** candidate.
- Track E01/E02, FUTURE_CAPABILITY, and remaining medium Stitch gaps as **V2.05** polish only.

**Forbidden without a new gate**

- Redefining `569712ad…` as the application candidate.
- Further V2.04 architecture / Stitch EXACT chasing as a release blocker.
- Implementing FUTURE_CAPABILITY controls merely for parity score.
- Shared testing DB wipe for cosmetics.
- Production or pronline deploy from this closure.

---

## 10. Final closure verdict

```text
VERSION=2.04
BRANCH=V4
GATE=FINAL_QA_CLOSURE
APPLICATION_CANDIDATE=c16c791f9a4d102aa213debb3f4f0975c258c487
HOSTED_REPOSITORY_SHA=569712ad3ce3ff82ef5d5a8c9bfbd066544d5d2d
APPLICATION_TREE_PARITY=PASS
APP_PATH_DIFF_COUNT=0
HOSTED_GEOGRAPHY=PASS
BB_REGISTRATION=PASS
AC_REGISTRATION=PASS
HOSTED_STITCH_PARITY=85.5
E01_STATUS=CLOSE
E02_STATUS=CLOSE
E01_E02_CLASSIFICATION=POST_QA_POLISH
RELEASE_BLOCKERS=0
PRONLINE_BRANCH=V10
PRONLINE_V10_PRESERVED=PASS
PRODUCTION_UNTOUCHED=PASS
FINAL=V2_04_FINAL_QA_CLOSURE_PASS
```
