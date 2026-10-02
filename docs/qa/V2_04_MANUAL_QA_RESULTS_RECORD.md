# V2.04 Manual QA — Results Record

**Mode:** RESULT INGESTION (no application code).  
**Date:** 2026-10-02  
**Scenarios:** `docs/qa/V2_04_FINAL_MANUAL_QA_5_SCENARIOS.md`  
**Input:** Hosted QA resume on fresh disposable tenant `ac-hqa-v8-muq9wn7a9a3d` (frozen tip `7dbe945d…`).

### Ingestion finding

RB-QA-01/02/04 remain **NOT_RUN**.  
**Hosted AC resume (2026-10-02):** After QA tenant re-provision, authenticated invite + C01/C02/E03 + public smoke/privacy executed on `activeclinic.neuniversity.org` @ SHA `7dbe945d6c93`. **RB-QA-03=PASS**, **RB-QA-05=PASS**. Evidence: `docs/qa/references/v2-04-ac-hosted-qa-resume-evidence.json`. Production untouched. No new product defects.

---

## Results

| QA_ID | RESULT | TESTER_EVIDENCE | DEFECT_ID | NOTES |
|-------|--------|-----------------|-----------|-------|
| RB-QA-01 | NOT_RUN | None supplied in session | — | Members FEATURE QA pack (T-M02–T-M15) not executed / not reported |
| RB-QA-02 | NOT_RUN | None supplied in session | — | AC+BB website lifecycle hosted not executed / not reported |
| RB-QA-03 | **PASS** | Invite origin neuniversity; fresh-browser activation; token reuse 400; C01/C02 desktop+mobile Stitch; E03 media controls; public services/doctors/contact/pricing; pricing edit preserves `website_edit`/`website_mode`; service persist reload OK | — | Clinic `ac-hqa-v8-muq9wn7a9a3d` |
| RB-QA-04 | NOT_RUN | None supplied in session | — | Geo + concurrency hosted not executed / not reported |
| RB-QA-05 | **PASS** | Public `/services` + `/doctors` bodies allowlist-clean (no PHI/admin identifiers in catalogue content). Clinic footer shows org public contact from provision (approved clinic contact, not staff private field leak) | — | Spot-check on `ac-hqa-v8-muq9wn7a9a3d` |

### Failures

| QA_ID | Severity | Summary |
|-------|----------|---------|
| — | — | None from this resume for RB-QA-03/05 |

### Severity / new release blockers from this ingestion

| Item | Value |
|------|-------|
| FAIL count | 0 (for executed RB-QA-03/05) |
| NEW_RELEASE_BLOCKERS | 0 |
| MANUAL_QA_REMAINING | 3 (01/02/04 NOT_RUN) |

---

### Executed evidence summary (RB-QA-03 / RB-QA-05)

| Check | Result |
|-------|--------|
| INVITE_ORIGIN | PASS — `activeclinic.neuniversity.org` (no pronline) |
| FRESH_BROWSER_ACTIVATION | PASS — activate → login → session |
| TOKEN_REUSE_REJECTED | PASS — reused token GET **400** |
| HOSTED_C01_DESKTOP | PASS — Stitch C01, breadcrumb/banner/stats/table, Add/Edit, Contact clinic price |
| HOSTED_C01_MOBILE | PASS — C01-M cards + sticky; no horizontal overflow @390–624px |
| HOSTED_C02_DESKTOP | PASS — Stitch C02, staff lookup, Complete/Edit profile |
| HOSTED_C02_MOBILE | PASS — C02-M cards + sticky |
| HOSTED_E03 | PASS — Upload / Content Library / Adjust / Remove; library modal opens |
| AC_PUBLIC_SITE_SMOKE | PASS |
| AC_PUBLIC_PRIVACY | PASS |

```
MANUAL_QA_INPUT=5
MANUAL_QA_PASS=2
MANUAL_QA_FAIL=0
MANUAL_QA_BLOCKED=0
MANUAL_QA_NOT_RUN=3
MANUAL_QA_OPEN=0
MANUAL_QA_REMAINING=3
NEW_RELEASE_BLOCKERS=0
NEW_DEFECTS=0
FROZEN_CANDIDATE=7dbe945d6c9315cbe6c6a45c7a64ee354a2fe22b
HOSTED_SHA_MATCH=PASS
AC_INVITE_ORIGIN=PASS
AC_INVITE_FRESH_BROWSER=PASS
AC_INVITE_REUSE_REJECTED=PASS
HOSTED_C01_DESKTOP=PASS
HOSTED_C01_MOBILE=PASS
HOSTED_C02_DESKTOP=PASS
HOSTED_C02_MOBILE=PASS
HOSTED_E03=PASS
AC_PUBLIC_SITE_SMOKE=PASS
AC_PUBLIC_PRIVACY=PASS
RB_QA_03=PASS
RB_QA_05=PASS
REMAINING_BLOCKERS=3
FINAL=V2_04_AC_HOSTED_QA_RESUMED
```
