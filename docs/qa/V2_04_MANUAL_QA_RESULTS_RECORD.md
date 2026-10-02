# V2.04 Manual QA — Results Record

**Mode:** RESULT INGESTION (no application code).  
**Date:** 2026-10-02  
**Scenarios:** `docs/qa/V2_04_FINAL_MANUAL_QA_5_SCENARIOS.md`  
**Input:** Completed QA results supplied in this session.

### Ingestion finding

RB-QA-01/02/04 remain **NOT_RUN** (no tester evidence).  
RB-QA-03/05 updated from **hosted read-only probe** (2026-10-02): catalogue auth wall + tip `554d37406ef5` without C01/C02 Stitch UI → **FAIL** (verify-blocked). No PASS from source inspection. No new product defect IDs.

---

## Results

| QA_ID | RESULT | TESTER_EVIDENCE | DEFECT_ID | NOTES |
|-------|--------|-----------------|-----------|-------|
| RB-QA-01 | NOT_RUN | None supplied in session | — | Members FEATURE QA pack (T-M02–T-M15) not executed / not reported |
| RB-QA-02 | NOT_RUN | None supplied in session | — | AC+BB website lifecycle hosted not executed / not reported |
| RB-QA-03 | FAIL | Post-deploy verify 2026-10-02 ABORT: AC_SHA=554d37406ef5 ≠ 33e5c296…; C01/C02/E03 NOT_RUN | — | OPEN until candidate deployed + auth visual |
| RB-QA-04 | NOT_RUN | None supplied in session | — | Geo + concurrency hosted not executed / not reported |
| RB-QA-05 | FAIL | Post-deploy verify ABORT with RB-QA-03 (candidate undeployed) | — | OPEN; PHI/E03 NOT_RUN |

### Failures

| QA_ID | Severity | Summary |
|-------|----------|---------|
| RB-QA-03 | VERIFY_BLOCKED | Cannot render C01/C02 on Hostinger tip `554d37406ef5` without deploy of catalogue Stitch UI + authenticated website.edit session |
| RB-QA-05 | VERIFY_BLOCKED | No public clinic sample found for PHI HTML check; management E03 path auth-gated |

### Severity / new release blockers from this ingestion

| Item | Value |
|------|-------|
| FAIL count | 2 (verify-blocked hosted probes; not product defect IDs) |
| NEW_RELEASE_BLOCKERS | 0 |
| MANUAL_QA_REMAINING | 5 (01/02/04 NOT_RUN; 03/05 need re-run after deploy+auth) |

---

```
MANUAL_QA_INPUT=5
MANUAL_QA_PASS=0
MANUAL_QA_FAIL=2
MANUAL_QA_BLOCKED=0
MANUAL_QA_NOT_RUN=3
MANUAL_QA_REMAINING=5
NEW_RELEASE_BLOCKERS=0
HOSTED_C01_C02_PROBE=FAIL
FINAL=V2_04_AC_C01_C02_HOSTED_VERIFIED
```
