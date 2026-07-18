# Batch 18C — HQ Giving Reports

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/reports/giving` **presentation only**. **Forms / Resources follow in Batch 18D; Requests not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 64), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_18B_HQ_ATTENDANCE_REPORTS.md`](./BATCH_18B_HQ_ATTENDANCE_REPORTS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `57-hq-consolidated-analytics-desktop` | `2a577dc15d4342acb152f16aed21c267` |
| Mobile | `57-hq-consolidated-analytics-mobile` | `06489c79d0d04a429e57eba5c717ba47` |

Marker: `data-bb-stitch-giving-report="57-hq-consolidated-analytics"` (+ `data-bb-hq-giving-report="1"`).

Stitch analytics frames include donor/trend chrome; V5 shows **existing monthly giving aggregates only**, with accessible bar tables instead of canvas charts.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/hq/giving-report.ejs` | Summary cards, category composition table/cards with accessible bars, branch comparison, empty/unavailable states |
| `public/blessboard/v5/hq-admin.css` | Giving report layout (`?v=38`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-reports-audit.test.js` | Giving report rendering, filters, privacy assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Giving report structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 64 Batch 18C note |
| `docs/gui/BATCH_18C_HQ_GIVING_REPORTS.md` | This document |

**Unchanged:** `getMonthlyGivingSummary`, giving repository SQL, `/hq/reports/giving` authz/filters (`month`, `branch`), money string formatting from service, `/hq/reports` hub, attendance report.

## 3. Financial data displayed (V5 aggregates only)

| Field | Source |
|-------|--------|
| Month | `yearMonth` (`month` query) |
| Scope | Church-wide vs branch key / display name |
| Grand totals by currency | `summary.grandTotalsByCurrency[]` → `currency`, `totalAmount` (exact NUMERIC string) |
| Category total | `churchTotals[]` or `byBranch[]` → `totalAmount`, `currency`, `categoryLabel`, `categoryKey` |
| Entry count | `entryCount` |
| Share of currency % | Presentation: category amount / same-currency grand total |
| Branch×currency rollup | Presentation cents-sum of `byBranch` rows (exact when inputs are decimal money strings) |
| Category×branch detail | Raw `byBranch` rows (expandable) |
| Source statuses | `summary.sourceStatuses` |

## 4. Privacy safeguards

- No donor names, emails, phones, or member ids
- No card / IBAN / account / payer fields
- No church UUID in HTML
- Amounts remain aggregate NUMERIC strings — not donor-level ledger lines
- Unavailable panel documents donor/bank/export omissions

## 5. Charts / tables shown

| Surface | Treatment |
|---------|-----------|
| Summary cards | Per-currency grand totals + category cards |
| Category composition | Desktop table with `role="img"` bar + %; mobile cards |
| Branch comparison | Desktop table + relative bars per currency; mobile cards; detail table |
| Empty month | Designed empty state + unavailable analytics list |

No Chart.js, `<canvas>`, or invented series.

## 6. Filters preserved

| Control | Param | Notes |
|---------|-------|-------|
| Month | `month` | Existing `type="month"` |
| Branch | `branch` | All branches or public key |
| Clear branch | — | Link to all-branches URL |

## 7. Unsupported analytics omitted

- Donor-level records and contact details
- Bank reconciliation / payment gateway settlement
- Trend % / forecasts / projections
- Accounting CSV / PDF exports
- Fabricated totals or cross-currency “% of everything” metrics
- New analytics SQL or service methods

## 8. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥900px` | Desktop tables; cards hidden |
| `<900px` | Category/branch cards; desktop table wraps hidden; stacked filter actions |

## 9. Verification

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-reports-audit.test.js` | **7/7 pass** |
| `node --test tests/blessboard-giving.test.js` | **8/8 pass** |
| `node --test` HQ giving/attendance a11y cases | **pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 10. Suggested commit message

```
feat(gui): HQ giving report Stitch presentation (Batch 18C)

Match /hq/reports/giving to Stitch 57 analytics chrome with currency
summary cards, accessible bar tables, and branch comparison from existing
monthly aggregates. No donor PII, forecasts, or new queries. Forms/Requests
unchanged.
```
