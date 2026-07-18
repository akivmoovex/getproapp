# Batch 06B — Tenant public Giving

**Date:** 2026-07-18  
**Scope:** Tenant public `/giving` only. Shell untouched except CSS cache bump. **Registration not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 19), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_06A_CONTACT.md`](./BATCH_06A_CONTACT.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Giving | `07-public-giving-desktop-v2 (Populated)` | `59c8fdedf68a43e3a5d2384b0c2212df` |
| Mobile Giving | `07-public-giving-mobile-v2 (Populated)` | `a0616f23568c464a95eda9e317e2fa9d` |
| Desktop empty (ref) | `07-public-giving-desktop-v2 (Empty)` | `a08093b9ec32467bad300ef43ac800fa` |

Obsolete IDs **not** used: giving-information base (`14115440…`, `5b65875a…`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/giving.ejs` | Hero eyebrows, method cards, instructions vs actions, empty state |
| `public/blessboard/v5/tenant-public.css` | Giving hero; mobile list cards; desktop grid |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=24` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=24` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | Giving render, visibility/security, empty |
| `tests/blessboard-v5-a11y-structure.test.js` | Giving structure + omitted payment chrome |
| `docs/gui/BATCH_06B_GIVING.md` | This document |

**Unchanged:** Giving route, `mapGiving` / `safeExternalUrl`, publication queries, hostname resolution, auth, Contact markup. **No payment processing, checkout, or donation collection.**

## 3. Giving data used

| Surface | Fields |
|---------|--------|
| Hero / intro | First published page section: `heading`, `bodyText`, `mediaUrl` (lead/media only when present) |
| Methods | Published `entities[]`: `label`, `instructions`, `methodType`, safe `externalUrl`, `icon` |
| Type label | Derived display only from `methodType` (Bank transfer / Mobile money / In person / External link) |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| Brand fallback | `pageTitle` / “Ways to Give” when no intro heading |

No bank names, merchant IDs, account numbers, QR codes, amounts, or contribution history are invented or exposed beyond published `instructions` text.

## 4. Safety notes

1. Draft giving methods never render.  
2. Tenant isolation: Church A methods do not appear on Church B.  
3. Unsafe `externalUrl` values stripped by `safeExternalUrl` at map time.  
4. Page notice + footer disclaimer: BlessBoard does not process payments or collect financial account details.  
5. **Instructions** block is labeled informational copy (`data-bb-giving-instructions`).  
6. External CTAs labeled **Open published link** (new tab) — not “Give Online” / “Donate Now”.  
7. Methods without a safe URL get **Contact for details** → `/contact`.  
8. No payment forms, amount fields, card/CVV capture, or checkout UI.

## 5. Intentional deviations from Stitch

1. **No Give Online / Donate Now / Scan to Give** payment chrome.  
2. **No fabricated bank boxes** (Standard Chartered, Airtel/MTN merchant IDs).  
3. **No impact stats** (15+ projects, families served) or “Your Recent Contributions”.  
4. **No QR payment** UI.  
5. **Nav** — full V5 CMS nav vs Stitch short mock nav (shell).  
6. **Mobile bottom-tab / FAB** — omitted (drawer shell).  
7. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk.

## 6. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; card `min-width: 0` |
| 375px | Giving eyebrow; horizontal method rows; stacked notice |
| 640px | 2-col method cards |
| 768px | Faithful Stewardship eyebrow; centered section head |
| 900px+ | Method grid up to 3-col |
| 1440px | Max width + gutter token |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **29/29 pass** (render, publication, unsafe URL strip, isolation, empty) |
| `npm run test:blessboard:a11y-structure` | **29/29 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps

1. Structured public bank/mobile fields (if product wants labeled account boxes) need schema with clear public-vs-private flags.  
2. Member registration screens are **Batch 07 / next** — not this batch.

## 9. Suggested commit message

```
Align tenant public Giving with canonical Stitch desktop and mobile.
```
