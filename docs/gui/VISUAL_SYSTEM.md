# BlessBoard V5 — visual design system

**Updated:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591` (GetPro Church Platform)  
**Companion map:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) · [`STITCH_IMPLEMENTATION_BACKLOG.md`](./STITCH_IMPLEMENTATION_BACKLOG.md)

This document describes the **shared V5 visual foundation** used by GUI batches. It does not redesign individual product screens.

## Source Stitch screens

| Exact title | Screen ID | Role |
|-------------|-----------|------|
| BlessBoard Visual System Specification | `c8d8352b1b95400cb25e32a79c2f0b2e` | Typography, color, spacing, radii, shadows, max width, control heights |
| BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` | Header/drawer, buttons, forms, cards, empty states, footer pattern |
| BlessBoard Public Visual System Board | `8f689e44024444839a9c3174f03d4101` | Public atmosphere / chrome reference |
| BlessBoard Logo & Header Spec | `7880f0e354c445729cc01125f1526603` | Header lockup |
| BlessBoard - Desktop Header Reference | `43d6d1cb110240c8aa7e5989386ea63b` | Desktop header sizing |
| BlessBoard - Mobile Header Reference | `2d430d9648cc404b88f7463e170aa3b5` | Mobile header / drawer |
| BlessBoard Powered by GetPro Logo | `503ff0d768f04d1db68b72ce309b040c` | GetPro accent lockup |
| BlessBoard Church Logo | `59da7230441e46d387320a2b6ef32f5c` | Brand mark asset |

**Product rule:** Primary remains Sacred Modernity violet `#6C5CE7` and font **Hanken Grotesk**. Do not copy Stitch HTML mock fonts (Inter) or alternate violet (`#3b22b5`).

---

## Asset files

| File | Purpose |
|------|---------|
| `public/blessboard/v5/design-tokens.css` | CSS custom properties (`--bb-*`) |
| `public/blessboard/v5/design-system.css` | Shared primitives (`.bb-ds-*`) |
| `public/blessboard/v5/design-system.js` | Opt-in drawer/modal behaviors |
| `views/blessboard/v5/partials/head-design-system.ejs` | Fonts + token/system CSS includes (`?v=2`) |

Shell-specific CSS (`apex.css`, `tenant-public.css`, `member-portal.css`, `branch-admin.css`, `hq-admin.css`, `platform-admin.css`, `tenant-auth.css`) continues to own layout for each portal. Tokens replace duplicated brand hex `:root` blocks.

---

## Token names (canonical)

### Color

| Token | Value | Stitch name |
|-------|-------|-------------|
| `--bb-color-primary` | `#6c5ce7` | Primary / BlessBoard Violet |
| `--bb-color-primary-hover` | `#5341cd` | Primary hover |
| `--bb-color-primary-soft` | `#efeaff` | Soft fill |
| `--bb-color-accent` | `#ff9800` | GetPro Orange (accent only) |
| `--bb-color-page` | `#fbf9f6` | Surface / warm page |
| `--bb-color-surface` | `#ffffff` | Elevated surface |
| `--bb-color-surface-dim` | `#f2f0ed` | Surface Dim |
| `--bb-color-ink` | `#1a1c1e` | On-Surface |
| `--bb-color-muted` | `#44474e` | On-Surface Variant |
| `--bb-color-border` | `#d1dce0` | Border |
| `--bb-color-error` | `#b3261e` | Form error |

Legacy aliases: `--bb-violet`, `--bb-getpro`, `--bb-ink`, `--bb-bg`, `--bb-line`, etc.

### Typography

| Token | Size | Stitch mapping |
|-------|------|----------------|
| `--bb-text-hero` | 64px (40px mobile) | H1 Hero |
| `--bb-text-h1` | 40px (32px mobile) | H2 Section |
| `--bb-text-h2` | 28px | H3 Subhead |
| `--bb-text-body-lg` | 18px | Body Large |
| `--bb-text-body` | 16px | Body Medium |
| `--bb-text-label` | 14px | Label/Small |
| `--bb-font-sans` | Hanken Grotesk | Typography |

Weights: 400 / 500 / 600 / 700.

### Spacing & layout

| Token | Value |
|-------|-------|
| `--bb-space-1` … `--bb-space-9` | 4–128px scale |
| `--bb-max` | 1280px |
| `--bb-gutter` | 32px desktop / 16px mobile |
| `--bb-header-h` | 80px desktop / 64px compact |
| `--bb-sidebar-w` | 16.5rem portal sidebar |
| `--bb-control-h` | 48px |
| `--bb-icon-size` | 24px |
| `--bb-touch-min` | 44px |
| `--bb-radius` | 16px |
| `--bb-radius-sm` | 8px |
| `--bb-shadow-sm` / `--bb-shadow-md` | Stitch shadows |

### Gradients

| Token | Use |
|-------|-----|
| `--bb-gradient-page` | Warm page atmosphere |
| `--bb-gradient-primary` | CTA panels / brand fills |
| `--bb-gradient-mesh` | Decorative meshes (no remote images) |

---

## Responsive breakpoints

| Name | Range | Notes |
|------|-------|-------|
| Mobile | `0–767px` | Compact type, 16px gutters, stacked footers/metrics |
| Desktop | `768px+` | Stitch “desktop” content width behavior |
| Shell nav / portal sidebar | `900px+` | Existing V5 drawer breakpoint for member/branch/HQ/platform shells |

Media queries use **literal pixel values** (CSS custom properties are not reliable in `@media` across all engines). Tokens `--bb-bp-md` / `--bb-bp-lg` document intent only.

---

## Shared partial / component map

### Partials (`views/blessboard/v5/partials/`)

| Partial | CSS / behavior | Notes |
|---------|----------------|-------|
| `head-design-system.ejs` | loads tokens + system | Include once before shell CSS |
| `icon.ejs` | `.bb-ds-icon` | Material Symbols Outlined |
| `page-header.ejs` | `.bb-ds-page-header` | Page title block |
| `metric-card.ejs` | `.bb-ds-metric` | Dashboard metric |
| `empty-state.ejs` | `.bb-ds-empty` | Empty lists |
| `loading-state.ejs` | `.bb-ds-state--loading` | Loading |
| `error-state.ejs` / `success-state.ejs` / `confirm-state.ejs` | `.bb-ds-state` | Full-page states |
| `form-errors.ejs` | `.bb-ds-alert--error` | Validation summary |
| `flash-message.ejs` | `.bb-ds-alert--*` | Flash/toast-style alerts |
| `pagination.ejs` | `.bb-ds-pagination` | Accessible paging |
| `modal-shell.ejs` | `.bb-ds-modal` + `data-bb-ds-modal` | Dialog chrome |
| `powered-by-getpro.ejs` | `.bb-powered-by` | GetPro orange lockup |

### CSS primitives (opt-in `.bb-ds-*`)

| Concern | Classes |
|---------|---------|
| Buttons | `.bb-ds-btn--primary` / `--secondary` / `--text` (`--ghost` alias) / `--danger` / `--sm` |
| Forms | `.bb-ds-field`, `.bb-ds-input`, `.bb-ds-select`, `.bb-ds-textarea`, `.bb-ds-checkbox` |
| Cards | `.bb-ds-card`, `--featured`, `--feature`, `.bb-ds-cta-panel` |
| Tables | `.bb-ds-table-wrap`, `.bb-ds-table`, `.bb-ds-table-cards`, `.bb-ds-responsive-table` |
| Badges | `.bb-ds-badge` + `--success` / `--error` / `--warning` / `--neutral` |
| Nav | `.bb-ds-nav`, `.bb-ds-drawer*`, `.bb-ds-public-header*` |
| Portal | `.bb-ds-portal`, `.bb-ds-portal-sidebar`, `.bb-ds-portal-top`, `.bb-ds-portal-main` |
| Footer | `.bb-ds-footer*` |
| Page | `.bb-ds-page`, `.bb-ds-skip`, `.bb-ds-container` |

### Existing shell chrome (not replaced this batch)

| Surface | Header / drawer implementation |
|---------|--------------------------------|
| Apex public | `apex-shell-*.ejs` + `apex.css` / `apex.js` |
| Tenant public | `tenant-public-shell-*.ejs` + `tenant-public.css` / `tenant-public.js` |
| Member / branch / HQ / platform | `*-shell-*.ejs` + portal CSS + `shell-nav.js` |

Design-system portal/public header classes are **available for gradual adoption**; live shells keep their stable class names so Batch 1 does not rebuild screens.

---

## Image handling rules

1. Use **local** brand assets already in the repo (e.g. `/church/images/brand/blessboard-small-church-logo.png`).
2. Do **not** add random placeholder / Unsplash / remote hero images for design-system work.
3. Do **not** add new runtime image CDNs unless already part of V5.
4. CMS/media URLs remain the media module’s responsibility (`/_bb/media/:assetId`); design system only styles empty/mesh fallbacks via CSS gradients.
5. Decorative meshes use `--bb-gradient-*` tokens, not bitmap placeholders.

---

## Accessibility rules

1. Semantic landmarks: skip link → `main`; headers/nav/footers labeled.
2. Visible `:focus-visible` rings on `.bb-ds-*` controls (2px primary + soft ring).
3. Touch targets ≥ `--bb-touch-min` (44px) on icon buttons, pagination, drawer links.
4. Modals: `role="dialog"`, `aria-modal="true"`, Escape closes, focus returns to opener; Tab cycles inside panel (`design-system.js`).
5. Drawers: `aria-expanded` on toggles; body scroll lock via `html.bb-ds-drawer-open`.
6. Form errors: `role="alert"` + `aria-live="assertive"` (`form-errors.ejs`).
7. Honor `prefers-reduced-motion` for spinner/button/input transitions.
8. Icons: decorative via `aria-hidden="true"` unless `label` is passed to `icon.ejs`.

---

## Known exceptions

| Exception | Reason |
|-----------|--------|
| Shells keep `bb-apex-*` / `bb-tp-*` / `bb-mp-*` / `bb-ba-*` / `bb-hq-*` / `bb-pa-*` class names | Avoid rewriting every screen in Batch 1; adopt `.bb-ds-*` incrementally |
| Portal sidebar breakpoint is **900px**, Stitch “desktop” content is **768px** | Preserves existing V5 shell behavior |
| Stitch footer newsletter / social clusters | Not invented without product/backend |
| Stitch Solutions dropdown | Apex marketing nav still Home/Login until marketing routes exist |
| Metric cards must use **live** counts only | Never fabricate Stitch demo metrics |
| Form control radius now **16px** (Stitch) | Slight visual change vs prior 8px inputs |
| Google Fonts for Hanken + Material Symbols | Already approved V5 head dependency |

---

## Cache / version

`head-design-system.ejs` defaults to `designSystemVersion = 2`. Bump that local (or pass `designSystemVersion`) when tokens or system CSS change.

---

## Verification

```bash
npm run test:blessboard:design-system
npm run test:blessboard:a11y-structure
git diff --check
```

Individual screen reconstruction belongs to later backlog batches (apex home/login → tenant public → portals).
