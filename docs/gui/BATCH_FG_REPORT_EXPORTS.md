# BATCH_FG_REPORT_EXPORTS — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — not retained; report export infrastructure absent

## Gates

| Check | Result |
|-------|--------|
| Report export/print retained in priority? | **No** — not listed as REQUIRED / OPTIONAL GROWTH / retained slice in [`FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md). Closest row is **scheduled reports** (**DEFERRED** — “No job/export queue”). |
| Existing export infrastructure for branch/HQ **reports**? | **No** — `hqReportsRoutes` / `hqReportsService` serve HTML aggregate views only; no CSV/PDF/print presentation routes for attendance or giving reports. |
| Safe to implement? | **No** |

## Pre-code verification

| Item | Finding |
|------|---------|
| HQ/branch report CSV | **Missing** for reports (forms/resources have attachment downloads elsewhere — **not** approved report-export infrastructure) |
| HQ/branch report PDF | **Missing** — media accepts PDF uploads; no report PDF generator |
| Print-friendly HTML for reports | **Not present** as a dedicated print state on report screens |
| Async export processing | **Not implemented** — must not be claimed |
| Stitch report action states | No retained batch mapping export CTAs for HQ reports; related Stitch notes often say **no export** (e.g. giving summary, branch registry) |

### Verdict

**MISSING_BACKEND / not retained** — do not invent CSV/PDF or async export. Print-only HTML would still be a new product surface without a retain decision and without an approved Stitch/action contract for this batch.

## Why this batch did not run

Instruction: run only if **retained** and **existing export infrastructure supports it**. Both fail. Shipping export/print would invent presentation and download contracts beyond the shipped HTML report hub.

## Current honest state (unchanged)

| Surface | State |
|---------|--------|
| `/hq/reports`, attendance/giving detail | Entitlement-gated HTML aggregates |
| Export / print / CSV / PDF for those reports | **Absent** |

## Resume when

1. Product retains report export/print (Foundation or Growth) in the priority doc.  
2. Product chooses print-HTML-only vs CSV (reuse patterns carefully; do not claim PDF if none exists).  
3. Column allowlists and generated-at/filter chrome are signed.  
4. Then re-run this batch.

## Not in this stop

- No new routes, views, or CSS  
- No PDF/CSV generators  
- No hosted migration  

## Suggested commit (docs only)

```text
Document report-exports batch stop: not retained; no report export infra.
```
