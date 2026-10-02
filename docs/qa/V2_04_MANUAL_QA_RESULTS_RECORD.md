# V2.04 Manual QA — Results Record

**Mode:** RESULT INGESTION (no application code).  
**Date:** 2026-10-02  
**Scenarios:** `docs/qa/V2_04_FINAL_MANUAL_QA_5_SCENARIOS.md`  
**Input:** Completed QA results supplied in this session.

### Ingestion finding

RB-QA-01/02/04 remain **NOT_RUN**.  
**Final hosted candidate verify (2026-10-02)** against `1b2aa5b7…`: live tip is `4a7cf4beb6c2` → **HOSTED_SHA_MATCH=FAIL**. Branch identity **PASS** (RB-ID-01). RB-QA-03/05 remain **OPEN** (invite origin + C01/C02/E03 + PHI not executed on expected candidate). Production untouched (`activeclinic.org` / `blessboard.com` still `03a89106e2fe` production).

---

## Results

| QA_ID | RESULT | TESTER_EVIDENCE | DEFECT_ID | NOTES |
|-------|--------|-----------------|-----------|-------|
| RB-QA-01 | NOT_RUN | None supplied in session | — | Members FEATURE QA pack (T-M02–T-M15) not executed / not reported |
| RB-QA-02 | NOT_RUN | None supplied in session | — | AC+BB website lifecycle hosted not executed / not reported |
| RB-QA-03 | OPEN | Final hosted verify 2026-10-02: live `4a7cf4beb6c2` ≠ candidate `1b2aa5b7…`; C01/C02/E03 + invite NOT_RUN on expected tip | — | Deploy candidate then auth catalogue + invite smoke |
| RB-QA-04 | NOT_RUN | None supplied in session | — | Geo + concurrency hosted not executed / not reported |
| RB-QA-05 | OPEN | Final hosted verify abort with RB-QA-03 (candidate undeployed); PHI NOT_RUN | — | Re-run after `1b2aa5b7…` deploy + published clinicKey |

### Failures

| QA_ID | Severity | Summary |
|-------|----------|---------|
| RB-QA-03 | VERIFY_BLOCKED | Expected candidate `1b2aa5b7…` not live (hosted `4a7cf4beb6c2`); authenticated C01/C02/E03 + invite origin not run |
| RB-QA-05 | VERIFY_BLOCKED | Same SHA gate; public PHI spot-check not run |

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
MANUAL_QA_FAIL=0
MANUAL_QA_BLOCKED=0
MANUAL_QA_NOT_RUN=3
MANUAL_QA_OPEN=2
MANUAL_QA_REMAINING=5
NEW_RELEASE_BLOCKERS=0
HOSTED_CANDIDATE=1b2aa5b7fd60ebff791aafeabed762abe520ee25
LIVE_TIP=4a7cf4beb6c2
HOSTED_SHA_MATCH=FAIL
BRANCH_IDENTITY=PASS
RB_ID_01=PASS
FINAL=V2_04_FINAL_HOSTED_CANDIDATE_VERIFIED
```
