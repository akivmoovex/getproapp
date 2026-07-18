# Batch 18B — HQ Attendance Reports

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/reports/attendance` **presentation only**. Giving reports follow in Batch 18C.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 64), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_18A_HQ_CONTENT.md`](./BATCH_18A_HQ_CONTENT.md), [`BATCH_15A_BRANCH_ATTENDANCE.md`](./BATCH_15A_BRANCH_ATTENDANCE.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `57-hq-consolidated-analytics-desktop` | `2a577dc15d4342acb152f16aed21c267` |
| Mobile | `57-hq-consolidated-analytics-mobile` | `06489c79d0d04a429e57eba5c717ba47` |

Marker: `data-bb-stitch-attendance-report="57-hq-consolidated-analytics"` (+ `data-bb-hq-attendance-report="1"`).

Stitch analytics frames include trend/forecast chrome; V5 shows **existing monthly attendance aggregates only**, with accessible bar tables instead of canvas charts.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/hq/attendance-report.ejs` | Summary cards, category composition table/cards with accessible bars, branch comparison, empty/unavailable states |
| `public/blessboard/v5/hq-admin.css` | Attendance report layout (`?v=37`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-reports-audit.test.js` | Report rendering, filters, anti-trend assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Attendance report structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 64 Batch 18B note |
| `docs/gui/BATCH_18B_HQ_ATTENDANCE_REPORTS.md` | This document |

**Unchanged:** `getMonthlyAttendanceSummary`, attendance repository SQL, `/hq/reports/attendance` authz/filters (`month`, `branch`), `/hq/reports` hub, giving report route/view.

## 3. Data fields shown (V5-calculated only)

| Field | Source |
|-------|--------|
| Month | `yearMonth` (existing `month` query) |
| Scope | Church-wide vs `branch` filter key / display name |
| Grand total | `summary.grandTotal` |
| Category headcount | `churchTotals[]` or `byBranch[]` → `totalCount` |
| Category events | `eventCount` |
| Category share % | Presentation: `totalCount / grandTotal` (same rows) |
| Branch rollup headcount | Presentation sum of `byBranch` rows per `branchKey` |
| Branch relative bar | Presentation: branch total / max branch total |
| Category×branch detail | Raw `byBranch` rows (expandable) |
| Source statuses | `summary.sourceStatuses` (submitted / approved / archived) |

## 4. Charts / tables shown

| Surface | Treatment |
|---------|-----------|
| Summary cards | Grand total + per-category cards |
| Category composition | Desktop table with `role="img"` bar + % label; mobile cards |
| Branch comparison | Desktop table + relative bars; mobile cards; optional detail table |
| Empty month | Designed empty state + unavailable analytics list |

No Chart.js, `<canvas>`, SVG chart libraries, or invented series.

## 5. Filters preserved

| Control | Param | Notes |
|---------|-------|-------|
| Month | `month` | Existing `type="month"` / `normalizeYearMonth` |
| Branch | `branch` | All branches or public branch key |
| Clear branch | — | Link back to all-branches URL |

No new date-from/date-to range; month remains the V5 date filter.

## 6. Unsupported analytics omitted

- Trend % / growth rates / YoY
- Forecasts and projections
- Individual / QR / biometric check-in analytics
- CSV / PDF export
- Fabricated averages (30-day, “Average Sunday”)
- New analytics SQL or service methods

## 7. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥900px` | Desktop tables; cards hidden |
| `<900px` | Category/branch cards; desktop table wraps hidden; stacked filter actions |

## 8. Verification

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-reports-audit.test.js` | **7/7 pass** |
| `node --test tests/blessboard-attendance.test.js` | **8/8 pass** |
| `node --test tests/blessboard-v5-a11y-structure.test.js` (HQ attendance report) | **pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Suggested commit message

```
feat(gui): HQ attendance report Stitch presentation (Batch 18B)

Match /hq/reports/attendance to Stitch 57 analytics chrome with summary
cards, accessible bar tables, and branch comparison from existing monthly
aggregates. No trends, forecasts, or new queries. Giving reports unchanged.
```
