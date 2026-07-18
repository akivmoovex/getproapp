# Batch 15B — Branch admin giving

**Date:** 2026-07-18  
**Scope:** Branch Admin **giving summaries, manual entry form, and entry detail presentation only**. Forms not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 51–52), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_15A_BRANCH_ATTENDANCE.md`](./BATCH_15A_BRANCH_ATTENDANCE.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop summary (primary) | `39-branch-giving-summary-desktop` | `cf849cdb676c48fd8f0f7d38b74c99b0` |
| Mobile summary | `39-branch-giving-summary-mobile` | `20f32c9e77af423ca6a849a6759add28` |
| Desktop settings (omit) | `38-branch-giving-settings-desktop` | `858c66cf5d654fffb90c5a264653f27a` |
| Mobile settings (omit) | `38-branch-giving-settings-mobile` | `0769a7e1813d490d921a72a8bc8c3334` |

Markers: `data-bb-stitch-giving="39-branch-giving-summary"`, `data-bb-stitch-giving-form="39-branch-giving-summary"`, `data-bb-stitch-giving-detail="39-branch-giving-summary"`.

Stitch **39** is the visual source for summary cards, history, and manual-entry chrome. Stitch **38** banking / QR / mobile-money settings UI is **intentionally omitted**.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/giving/admin-list.ejs` | Summary cards, status chips, desktop table + mobile cards, empty states, unavailable notes, currency display |
| `views/blessboard/v5/giving/admin-form.ejs` | Sectioned manual-entry form; preserve POST field names |
| `views/blessboard/v5/giving/admin-detail.ejs` | Detail chrome, lifecycle, privacy hint, submit/void modals |
| `public/blessboard/v5/branch-admin.css` | Giving layout (`?v=28`) |
| `public/blessboard/v5/hq-admin.css` | Shared giving styles (`?v=24`) |
| Shell partials | CSS cache bumps |
| `tests/blessboard-giving.test.js` | Stitch markers, no fabricated trends, form fields |
| `tests/blessboard-v5-a11y-structure.test.js` | Giving structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 51–52 notes |
| `docs/gui/BATCH_15B_BRANCH_GIVING.md` | This document |

**Unchanged:** `givingService` create/update/submit/approve/void, monthly summary SQL, CSRF, branch scoping, routes and field names.

## 3. Data displayed (backend-supplied only)

| Data | Source |
|------|--------|
| Monthly grand totals by currency | `summary.grandTotalsByCurrency` (`totalAmount`, `currency`) |
| Category monthly rows | `summary.churchTotals` / `byBranch` (`categoryKey`, `categoryLabel`, `totalAmount`, `entryCount`, `currency`) |
| Category catalog | `categories` (`category_key` / labels) |
| Entry list | `entries[]` (`amount`, `currency`, category, `giving_date`, `status`, reference) |
| Entry detail | Single aggregate entry fields + lifecycle status |

Currency display uses `formatGivingMoney()`: ISO code + exact decimal string with grouping (no float math). Raw amounts remain on `data-bb-giv-amount` / `data-bb-total` for tests.

## 4. Financial safeguards

| Safeguard | How |
|-----------|-----|
| Aggregate-only | No donor names, emails, phones, or member links |
| No payment UI | Bank/QR/mobile-money settings (Stitch 38) omitted |
| Exact money | Service NUMERIC / string amounts; display without float arithmetic |
| Branch scoping | Existing tenant + branch authorization preserved |
| CSRF | Create/edit/submit/void forms keep `_csrf` |
| Private finance | Disclaimer + privacy copy; church/branch UUIDs not leaked in HTML |

## 5. Unsupported features omitted

| Omitted | Reason |
|---------|--------|
| Banking / QR / Airtel Money setup (Stitch 38) | Not in V5 product for this surface |
| Donor-level records | Forbidden / not stored |
| Online payments / Stripe / PayPal | Not supported |
| Bank reconciliation | Not supported |
| Receipts / accounting exports | Not supported |
| YTD / +12% / vs last month trends | Not supplied by backend |
| Fabricated comparisons | Would invent metrics |

## 6. Actions preserved

| Action | Method / path |
|--------|----------------|
| List + filters | `GET …/giving?month&status` |
| Create draft | `POST …/giving` (`category_key`, `giving_date`, `amount`, `currency`, `reference`, `notes`, `_csrf`) |
| Edit | `POST …/giving/:id/edit` |
| Submit | `POST …/giving/:id/submit` |
| Void | `POST …/giving/:id/void` |
| HQ approve | existing HQ POSTs |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:giving` | **8/8 pass** |
| `npm run test:blessboard:a11y-structure` | **57/57 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
Polish branch-admin giving summaries and manual entry to Stitch aggregate chrome.
```
