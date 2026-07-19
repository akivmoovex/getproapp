# Batch FG-08a — HQ reports hub + attendance (Growth)

**Date:** 2026-07-19  
**Batch ID:** FG-08a  
**Package:** Growth (`advanced_reports`); Foundation keeps basic hub  
**Companion:** [`FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md`](./FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md) · [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md) · [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md)

## 1. Canonical Stitch IDs

| Viewport | Screen ID | Exact title / map key |
|----------|-----------|------------------------|
| Desktop | `2a577dc15d4342acb152f16aed21c267` | 57-hq-consolidated-analytics-desktop |
| Mobile | `06489c79d0d04a429e57eba5c717ba47` | 57-hq-consolidated-analytics-mobile |

Performance Stitch `f6b63697…` was reference only — not implemented as a separate screen.

## 2. Routes preserved

| Route | Method | Change |
|-------|--------|--------|
| `/hq/reports` | GET | Passes `reportTier`; destination card labels Growth gate for attendance |
| `/hq/reports/attendance` | GET | Requires `advanced_reports`; Foundation gets honest fallback (200) |
| `/hq/reports/giving` | GET | Untouched in FG-08a (deferred to FG-08b) |

HQ role gate unchanged (`church_hq_admin` / `platform_admin`). Branch scoping via existing `?branch=` filter.

## 3. Files changed

- `src/blessboard/services/hqReportsService.js` — `resolveChurchReportTier` / shared soft tier resolve
- `src/blessboard/http/hqReportsRoutes.js` — attendance entitlement gate; hub `reportTier` locals; CSS cache bump in controlled HTML
- `views/blessboard/v5/hq/reports.ejs` — FG-08a markers, tier chip, Growth-required attendance card
- `views/blessboard/v5/hq/attendance-report.ejs` — entitlement denied empty + advanced detail chrome
- `public/blessboard/v5/hq-admin.css` — gated card / denied polish
- `views/blessboard/v5/partials/hq-shell-start.ejs` (+ related HQ CSS version refs) — `hq-admin.css?v=46`
- `tests/blessboard-reports-audit.test.js` — Foundation denial + Growth entitled paths
- `tests/blessboard-v5-a11y-structure.test.js` — markers + CSS version
- `docs/gui/BATCH_FG08A_HQ_REPORTS.md` — this file

## 4. Growth entitlement behavior

| Plan | Hub `/hq/reports` | Detail `/hq/reports/attendance` |
|------|-------------------|----------------------------------|
| Foundation (`free`, `basic_reports`) | Snapshot OK · `data-bb-report-tier="basic"` · attendance card `growth-required` | Fallback · `data-bb-att-report-entitlement="denied"` · no category bars/filters |
| Growth (`advanced_reports`) | `data-bb-report-tier="advanced"` · attendance card unlocked | Full live summary · `entitlement="advanced"` |

Entitlement source: existing `platform.plans` / `plan_features` via soft resolve — no new schema.

## 5. Foundation behavior preserved

- Hub continues to show live multi-branch aggregates (members, pending regs, attendance headcount, giving currency totals, announcements, events, open requests).
- No forced upgrade wall on the hub.
- No Network sales copy, custom domains, mailboxes, API, or webhooks.

## 6. Data and metrics shown

Live only (existing services):

- Hub: active members by branch, pending registrations, attendance headcount/events by branch, giving by currency/branch, announcement/event/request counts
- Attendance (Growth): monthly category totals, branch rollup, proportional bars from same-month totals

Not shown: charts/canvas, MoM %, forecasts, YoY, donor PII, compliance scores, CSV/PDF, scheduled report builders.

## 7. Unsupported functionality omitted

- FG-08b giving entitlement chrome (route still live without Growth gate in this batch)
- Scheduled reports / generators
- Network custom domain / email / API / webhooks / managed services
- Fabricated cross-branch forecasts or delivery analytics
- New schema or backend report services

## 8. Responsive status

| Width | Expectation | Status |
|-------|-------------|--------|
| ≤899px | Summary cards / branch cards; tables desktop-hidden | Existing HQ media queries + gated card stack |
| ≥900px | Two-column destination cards; desktop tables | Preserved |
| 320–375px | No invented overflow; empty-state CTA usable | Static CSS |

Live browser pixel QA vs Hostinger not run in this batch.

## 9. Tests

```text
npm run test:blessboard:reports-audit     → 7 pass / 0 fail
npm run test:blessboard:a11y-structure     → 87 pass / 0 fail
npx stylelint public/blessboard/v5/hq-admin.css → 0 errors, 246 warnings (pre-existing color-no-hex)
git diff --check (batch paths)             → clean
```

Authorization: HQ-only on reports routes (branch admin → 403). Growth entitlement covered in reports-audit (Foundation denied fallback → Growth advanced UI).

## 10. Suggested commit message

```text
Gate HQ attendance report on Growth advanced_reports and align hub chrome with Stitch.
```
