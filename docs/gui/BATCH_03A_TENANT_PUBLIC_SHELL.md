# Batch 03A — Tenant public shared shell

**Date:** 2026-07-18  
**Scope:** Shared tenant public chrome only (header, drawer, footer, skip/focus, content container). **Home and About interiors not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 91 + home shell chrome), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`STITCH_IMPLEMENTATION_BACKLOG.md`](./STITCH_IMPLEMENTATION_BACKLOG.md) Batch 3

## 1. Canonical Stitch IDs used

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop header sizing | BlessBoard - Desktop Header Reference | `43d6d1cb110240c8aa7e5989386ea63b` |
| Mobile header / drawer | BlessBoard - Mobile Header Reference | `2d430d9648cc404b88f7463e170aa3b5` |
| Logo / header lockup | BlessBoard Logo & Header Spec | `7880f0e354c445729cc01125f1526603` |
| Powered by GetPro | BlessBoard Powered by GetPro Logo | `503ff0d768f04d1db68b72ce309b040c` |
| Church logo mark | BlessBoard Church Logo | `59da7230441e46d387320a2b6ef32f5c` |
| Shell chrome (desktop) | 01-public-home-desktop-v2 (Refined) | `ead45db5be774baa9454412262096ffc` |
| Shell chrome (mobile) | 01-public-home-mobile-v2 (Refined) | `89177588fbf8405dbebd5747c38e19ce` |

Supporting tokens: Visual System Specification `c8d8352b…`, Shared UI States Board `b61a1ea8…`, Public Visual System Board `8f689e44…`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Header brand mark sizes, drawer logo + `inert`, main `tabindex="-1"`, CSS `?v=16` |
| `views/blessboard/v5/partials/tenant-public-shell-end.ejs` | Footer brand lockup; Quick Links from `navItems`; JS `?v=5` |
| `public/blessboard/v5/tenant-public.css` | Shell header/nav/drawer/footer/container/skip/Powered-by |
| `public/blessboard/v5/tenant-public.js` | `inert`, reduced-motion close delay, resize close at 900px+, menu label toggle |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=16` only |
| `tests/blessboard-v5-a11y-structure.test.js` | Shell structure assertions |
| `docs/gui/BATCH_03A_TENANT_PUBLIC_SHELL.md` | This document |

**Unchanged:** routes, hostname resolution, auth, queries, page interiors (`home.ejs` / `about.ejs` content).

## 3. Shell behavior

| Surface | Behavior |
|---------|----------|
| Desktop header | Sticky, 80px (`--bb-header-h`), 1280 max + 32px gutter; centered primary nav; Register + Member Login right |
| Mobile header | Compact 64px; logo left; menu button ≥44px (a11y over Stitch 24px hit-area note) |
| Brand | BlessBoard church mark + live `publicName` (+ optional branch label). No tenant logo URL in schema |
| Active nav | Desktop underline + violet weight; drawer left border + soft fill; `aria-current="page"` |
| Mobile drawer | Right panel, overlay, Escape + Tab trap, `inert` when closed, closes on link / overlay / ≥900px resize |
| Content container | `.bb-tp-container` / header+footer inners share `--bb-max` + `--bb-gutter` |
| Footer | Brand lockup; Quick Links = same live `navItems` (no dead links); contact from published settings; Members → `/login`, `/register`, apex |
| Powered by GetPro | Drawer + copyright bar; muted label + orange **GetPro** |
| Skip / focus | Skip → `#bb-tp-main`; `:focus-visible` rings on nav, drawer, CTAs, footer; main focusable for skip |

## 4. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Overflow guards; tighter padding; brand ellipsis |
| 375px | Drawer nav; 24px mark; 16px gutters |
| 768px | Footer 3-col (brand spans); still hamburger until 900 |
| 900px+ | Desktop nav + header CTAs; drawer hidden |
| 1200px+ | Nav gap 32px (Stitch) when width allows |
| 1440px | Max width + gutter token |

## 5. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **24/24 pass** |
| `npm run test:blessboard:a11y-structure` | **21/21 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 6. Remaining gaps

1. Tenant-specific uploaded logo — blocked until schema/settings field exists.  
2. Stitch short mock nav vs V5’s eight live CMS routes (intentional; no dead links).  
3. Stitch mobile bottom-tab / FAB — omitted for public tenant sites (drawer instead).  
4. Footer newsletter / social / Privacy Policy — no routes; not invented.  
5. Home / About page interiors — **Batch 03 / 03B**, not this shell-only batch.

## 7. Suggested commit message

```
Polish tenant public shared shell against Stitch header and footer chrome.
```
