# Batch 06 — Tenant public Contact and Giving

**Date:** 2026-07-18  
**Scope:** `/contact` and `/giving` only (tenant public shell CSS bump shared)  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_05_EVENTS_SERMONS.md`](./BATCH_05_EVENTS_SERMONS.md)

## 1. Canonical Stitch screen IDs

| Screen | Desktop | Mobile | Exact titles |
|--------|---------|--------|--------------|
| Contact | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` | `08-public-contact-desktop-v2 (Populated)` / `08-public-contact-mobile-v2 (Populated)` |
| Giving | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` | `07-public-giving-desktop-v2 (Populated)` / `07-public-giving-mobile-v2 (Populated)` |
| Giving empty | `a08093b9ec32467bad300ef43ac800fa` | — | `07-public-giving-desktop-v2 (Empty)` |

Obsolete / base IDs **not** used: contact base (`6d4d6ae2…`, `8f6f1528…`), giving information base (`14115440…`, `5b65875a…`).

## 2. Files changed

| Area | Path |
|------|------|
| Contact | `views/blessboard/v5/public/contact.ejs` |
| Giving | `views/blessboard/v5/public/giving.ejs` |
| CSS | `public/blessboard/v5/tenant-public.css` (`?v=14`) |
| Shell default CSS href | `views/blessboard/v5/partials/tenant-public-shell-start.ejs` |
| Model CSS href | `src/blessboard/http/loadTenantPublicPageModel.js` |
| Tests | `tests/blessboard-public-pages.test.js`, `tests/blessboard-v5-a11y-structure.test.js` |
| Doc | `docs/gui/BATCH_06_CONTACT_GIVING.md` |
| Screen map notes | `docs/gui/STITCH_SCREEN_MAP.md` |

**Unchanged:** routes, CSRF middleware (none on these GET pages), validation, publication queries, Events/Sermons markup (shell CSS version only). Registration / auth screens not started.

## 3. Data sources (real fields only)

| Surface | Fields |
|---------|--------|
| Page intro | Published page sections: `heading`, `bodyText`, `mediaUrl` |
| Contact channels | Published `label`, `value`, `channelType`, safe `href` (`mailto:` / `tel:` / HTTPS) |
| Settings fallbacks | Branch-first then church: `email`, `phone`, address lines; map only with valid lat/lng |
| Giving methods | Published `label`, `instructions`, `methodType`, safe `externalUrl` |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |

## 4. Form behavior

| Surface | Behavior |
|---------|----------|
| Contact | **No contact form** — V5 has no public contact-submission route/workflow. Stitch “Send a Message” form omitted. |
| Contact CSRF | N/A (GET-only public page; no POST) |
| Giving | **No payment form** — no amount, card, bank, or mobile-money capture |
| Giving links | Safe `externalUrl` opens in a new tab as “Open published link”; otherwise “Contact for details” → `/contact` |

## 5. Security / visibility notes

1. Draft contact channels and draft giving methods never render.  
2. Tenant isolation: Church A content does not appear on Church B host.  
3. Unsafe URLs stripped by `safeExternalUrl` (e.g. `javascript:`).  
4. Map iframe only when coordinates validate; OSM embed + directions only.  
5. Phone/email use `tel:` / `mailto:` with accessible labels.  
6. Giving instructions shown as labeled informational text — not payment actions.  
7. Page-level safety notice + footer disclaimer: BlessBoard does not process payments.  
8. No invented bank names, merchant IDs, office hours, or map pins.

## 6. Empty / unavailable states

| Case | UI |
|------|----|
| Contact empty | Split empty + Contact hint + Home / About |
| Address without coordinates | Address cards/lines still show; `data-bb-contact-map="unavailable"` status |
| Giving empty | Split empty + “Not available online” + Contact / Home |

Omitted from Stitch empty chrome: fabricated In-Person / Bank Transfer teaser cards with invented details.

## 7. Intentional deviations

1. No contact form, subject dropdown, or newsletter subscribe.  
2. No Service Times / Office Hours sidebar (no public schema for hours).  
3. No giving impact stats (15+ projects, families served) or contribution history.  
4. No “Give Online” / “Donate Now” / QR payment chrome.  
5. No fabricated Standard Chartered / Airtel / MTN account boxes.  
6. External giving CTAs labeled “Open published link” (not payment).  
7. Methods without a safe URL get Contact for details (not a fake “Request Details” workflow).  
8. Mobile bottom-tab chrome omitted (tenant drawer shell).  
9. Sacred Modernity violet + Hanken (not Stitch Inter).

## 8. Responsive status

| Width | Notes |
|-------|-------|
| 375px | Contact/giving cards single column; map full width |
| 768px | Cards 2-col (`640px+`) |
| 1440px | Cards 3-col (`900px+`); taller map iframe |
| 320px | Shell overflow guards; card `min-width: 0` / `overflow-wrap` |

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **24/24 pass** |
| `npm run test:blessboard:tenant-routing` | **44/44 pass** |
| `npm run test:blessboard:a11y-structure` | **19/19 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 10. Remaining gaps / next recommendation

- Contact form needs an explicit product route + CSRF + storage before Stitch form parity.  
- Service / office hours need a published settings field.  
- Structured bank/mobile-money fields (if product wants labeled account boxes) need schema with clear public-vs-private flags.  
- **Next:** Tenant auth / member registration screens (`/register`, `/register/submitted`) — Batch 7 — only when requested.

## 11. Suggested commit message

```
Align public contact and giving pages with Stitch info-only layouts.
```
