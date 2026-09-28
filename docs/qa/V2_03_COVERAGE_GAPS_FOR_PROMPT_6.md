# V2.03 Ranked Coverage Gaps (Prompt 6 input)

**Source measurement:** `docs/qa/V2_03_90_COVERAGE_BASELINE.md`  
**Generated:** 2026-09-28  
**Machine JSON:** `coverage/v203/v203-ranked-gaps.json`  
**Analyzer:** `coverage/coverage-gap-report.md`

## Gate status

All OVERALL / PLATFORM / BLESSBOARD / ACTIVECLINIC metrics are **below 90%**.  
Prompt 6 should add **meaningful** behavioral tests targeting the ranked surfaces below (not line-touch / import-only).

## Top 40 uncovered-volume files

| Rank | File | Lines % | Branches % | Uncovered lines | Uncovered branches |
|--|--|--:|--:|--:|--:|
| 1 | `src/routes/admin/adminChurchPlatform.js` | 13.20 | 100.00 | 3544 | 0 |
| 2 | `src/platform/http/platformAdminRoutes.js` | 40.61 | 70.73 | 3168 | 144 |
| 3 | `src/blessboard/http/contentAdminRoutes.js` | 17.93 | 85.00 | 2709 | 3 |
| 4 | `src/activeclinic/services/activeClinicBillingService.js` | 10.04 | 22.22 | 2212 | 14 |
| 5 | `src/activeclinic/http/activeClinicBillingRoutes.js` | 18.04 | 100.00 | 2185 | 0 |
| 6 | `src/blessboard/repositories/platformChurchRegistrationRepository.js` | 33.84 | 35.00 | 2099 | 39 |
| 7 | `src/blessboard/services/websitePublicationVersionService.js` | 14.95 | 100.00 | 1882 | 0 |
| 8 | `src/blessboard/http/loadTenantPublicPageModel.js` | 17.86 | 56.45 | 1784 | 54 |
| 9 | `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js` | 22.50 | 100.00 | 1760 | 0 |
| 10 | `src/routes/fieldAgent.js` | 11.57 | 75.00 | 1589 | 3 |

*(Full 100-row list in `v203-ranked-gaps.json`.)*

## Suggested Prompt 6 workstreams

1. **ACTIVECLINIC first** (lowest lines %): billing service/routes, clinical/patient/portal HTTP, website CMS routes — workflow + negatives.
2. **BLESSBOARD:** content-admin routes, registration repository, publication version service, tenant public page model.
3. **PLATFORM / shared admin:** `platformAdminRoutes.js`, `adminChurchPlatform.js`.
4. Prefer tests that exercise authz → validate → mutate → persist → reload.
5. Parallel: continue reducing `TEST_FAIL` residuals so measurement reflects executed paths.

## Marker

```text
V2_03_COVERAGE_GAPS_RANKED_FOR_PROMPT_6
```

---

## Prompt 6 outcome (2026-09-28)

High-value behavioral suites added/expanded (`tests/v203-coverage-gap-closure.test.js`); scoped AC billing/clinical/authz files improved sharply under `coverage/v203-gap6/`.

**Suite overall / product scopes remain below 90%** (Prompt 5 census authoritative). Scale deficit ~236k statements; historical freeze ceiling ~65.71% lines.

```text
V2_03_90_PERCENT_TARGET_BLOCKED
```

See `docs/qa/V2_03_OVERNIGHT_STATE.md` Prompt 6 section.
