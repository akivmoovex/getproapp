# PHASE2_085 — Shared church website shell ↔ Stitch parity

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 tenant public shell only (header, nav, drawer, footer, shared chrome)  
**Prerequisite:** `PHASE2_084` Batch 1  
**Constraint:** No page-specific content section rewrites

## Verdict

**COMPLETE** for shared-shell Batch 1.

Desktop primary nav no longer wraps (`flex-wrap: nowrap`); header height locked to Stitch **80px** (`--bb-header-h: 5rem` / `h-20`). Preview and public share the same shell; preview banner is full-bleed with an inner `max-width: var(--bb-max)` so page containers stay aligned.

---

## 1. Stitch screens used

| Role | Exact title | Screen ID |
|------|-------------|-----------|
| Desktop header SoT | `BlessBoard - Desktop Header Reference` | `43d6d1cb110240c8aa7e5989386ea63b` |
| Mobile header SoT | `BlessBoard - Mobile Header Reference` | `2d430d9648cc404b88f7463e170aa3b5` |
| Tokens / system board | `BlessBoard Public Visual System Board` | `8f689e44024444839a9c3174f03d4101` |
| Project | GetPro Church Platform | `projects/17124191473876947591` |

Embodied footer chrome follows public home/about frames (no standalone footer screen). Bottom-tab / FAB mobile patterns remain **out of scope** (product drawer).

---

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | CSS `?v=32`; preview banner inner; `data-bb-nav`; brand `title`; drawer marker |
| `views/blessboard/v5/partials/tenant-public-shell-end.ejs` | `tenant-public.js?v=7` |
| `views/blessboard/v5/partials/head-design-system.ejs` | design-tokens/system default `?v=6` |
| `views/blessboard/v5/content-admin/preview.ejs` | obsolete template CSS bump `?v=32` |
| `public/blessboard/v5/tenant-public.css` | Header/nav/brand/preview/footer/card/breakpoints |
| `public/blessboard/v5/design-tokens.css` | Layout tokens (`--bb-section-desktop`, header comments) |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=32` |
| `tests/blessboard-v5-frontend-assets.test.js` | Versions + shell CSS assertions |
| `tests/blessboard-public-pages.test.js` | PHASE2_085 shell / escape / V4 tests |
| `docs/phase2/PHASE2_085_SHARED_SHELL_STITCH_PARITY.md` | This report |

**Not changed:** page body templates (`public/home.ejs`, about, …), demo seed data, V4 `church.css` / `views/church/**`.

---

## 3. Shared elements completed

| Element | Status |
|---------|--------|
| Header (80px, sticky, blur) | Done |
| Desktop navigation (nowrap, dense 8-route gap) | Done |
| Mobile drawer + burger (keyboard Esc/Tab trap unchanged) | Done |
| Logo treatment (24px mobile / 30px desktop) | Done |
| Primary header CTAs (Register + Member Login) | Done |
| Page-width containers (`--bb-max` 1280) | Done |
| Global typography (Hanken Grotesk + tokens) | Done |
| Buttons (radius / primary violet / ghost) | Done |
| Section spacing tokens | Done (shell-level; page sections deferred) |
| Shared `.bb-tp-card` surface | Done |
| Preview banner (same page width) | Done |
| Footer grid / bar / Powered by GetPro | Done |
| Responsive breakpoints (390 / 430 / 900 / 1200 / 1440) | Done |
| Long church names (2-line clamp + escape) | Done |

---

## 4. CSS version

| Asset | Version |
|-------|---------|
| `tenant-public.css` | **32** |
| `tenant-public.js` | **7** |
| `design-tokens.css` / `design-system.css` | **6** |

---

## 5. Desktop behavior

- Header inner: fixed **80px** height, **nowrap** flex row.
- Nav: visible from **900px+**; denser gaps at 900–1199; wider gaps from 1200+.
- Brand: up to ~2 lines before clamp; full name in `title` / `aria-label`.
- Actions: Register (ghost) + Member Login (primary); env badge from 768+.
- Containers / footer / preview banner inner share **1280px** max width.

---

## 6. Mobile behavior

- Burger opens accessible drawer (`role="dialog"`, focus trap, Escape, overlay).
- Logo **24px**; brand max-width `calc(100vw - 5.5rem)` at ≤430px.
- Gutters use `--bb-gutter-mobile` (16px); body `overflow-x: clip`.
- No bottom tabs / FAB.
- Preview banner stacks links without widening page chrome.

---

## 7. Tests and results

```text
node --test tests/blessboard-v5-frontend-assets.test.js tests/blessboard-public-pages.test.js
→ 48 pass / 0 fail
```

Covered: shared header, desktop nav markers, mobile drawer a11y attrs, active nav, preview banner markup (assets), public absence of admin chrome, footer, escaped church name, 390/430 structural CSS, V4 untouched.

Preview banner live behavior remains covered by existing content-admin suite assertions (`data-bb-preview-banner`, shared shell).

---

## 8. Remaining page-specific gaps (from PHASE2_084)

Deferred to later batches — **not** in this prompt:

1. Home desktop IA / hero 1:1 crop / Stitch sidebar widgets  
2. About stats/impact/story collage chrome  
3. Events/sermons demo image wiring  
4. Contact form (blocked) / giving method richness  
5. Listing-page hero density polish  

---

## Safety

- Public pages never render preview admin links.
- Same shell for public + authenticated preview.
- No hotlinked Stitch images; brand mark remains local.
- V4 church templates/CSS untouched.
