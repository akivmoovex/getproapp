# BATCH_NETWORK_EXECUTIVE_DASHBOARD — NW-EX-01 shipped

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **SHIPPED**  
**Prompt:** 45. IMPLEMENT NETWORK EXECUTIVE DASHBOARD  
**Gate:** [`NETWORK_EXECUTIVE_DASHBOARD_DATA.md`](../product/NETWORK_EXECUTIVE_DASHBOARD_DATA.md) — **PARTIALLY READY** · approved minimum metrics only

## What shipped

| Item | Detail |
|------|--------|
| Route | `GET /hq/reports/executive` |
| Entitlement | Soft `executive_reports` — **true** on Network (`professional` / `partner`); **false** on Foundation / Growth |
| Data | Reuses `getHqOperationalReport` + `listBlessBoardBranches` (pool-level `Promise.all`) |
| GUI | `views/blessboard/v5/hq/executive-dashboard.ejs` — desktop tables + mobile cards |
| Nav | HQ “Executive” → `/hq/reports/executive` |
| Hub link | Reports destinations card (Network-tier) |

## Approved metrics shown

Active branches · active members · pending registrations · monthly attendance (+ branch comparison bars) · giving by currency / branch · open requests · announcement read receipts · event registration counts.

## Explicitly omitted

Trends % · forecasts · compliance / monthly-report status · health/engagement scores · donor/person analytics · forms rollup · Daily/Weekly toggles · canvas charts.

## Growth / Foundation denial

Same route returns **200** with `data-bb-exec-denied="1"` and no aggregate payload (no fabricated zeros that imply compliance). Network sees `data-bb-exec-entitlement="network"`.

## Filters / rules

| Rule | Behavior |
|------|----------|
| Month | `YYYY-MM` calendar month (UTC default) |
| Branch | Optional public key; unknown → 404 |
| Church scope | HQ / PA only; cross-host → 403 |
| Currency | Per-currency rows only |
| Query | No per-branch N+1; one operational report load |

## Files

- `db/seeds/003_blessboard_plans.sql` — `executive_reports` true for Network
- `src/blessboard/services/hqReportsService.js` — `resolveChurchExecutiveReports`
- `src/blessboard/http/hqReportsRoutes.js` — executive route
- `src/blessboard/http/hqAdminNav.js` · `hqAdminShellLocals.js`
- `views/blessboard/v5/hq/executive-dashboard.ejs` · `reports.ejs` hub link
- `public/blessboard/v5/hq-admin.css` (`?v=51`)
- `tests/blessboard-hq-executive-dashboard.test.js`
- Entitlement / a11y / matrix doc updates

## Tests

```bash
node --test --test-concurrency=1 tests/blessboard-hq-executive-dashboard.test.js
node --test --test-concurrency=1 tests/platform-entitlements.test.js
node --test --test-concurrency=1 tests/blessboard-v5-a11y-structure.test.js
git diff --check
```

## Hosted migration

**Seed re-apply** for plan features (`003_blessboard_plans.sql`) so Network orgs gain `executive_reports`. No DDL migration.

## Stop

Executive dashboard only — no exports, charts libraries, or hierarchy UI.
