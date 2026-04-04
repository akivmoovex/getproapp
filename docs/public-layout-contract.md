# Public layout contract

This document describes the **single content band** used on public (non-admin) pages. The same rules are summarized in `public/styles.css` above `.container, .ds-container, .ds-layout-public`.

## Visual source of truth (home first)

For **public chrome and search**, the **homepage** (`main.gp-home`, hero search) is authoritative:

- **App bar** — `views/partials/site_header.ejs` + `.app-top-app-bar` in `public/styles.css` (one bar for all public routes).
- **Search shell** — `#site-search-bar.gp-home-search-card` and `.gp-home-search-card` rules (same classes on directory/category).
- **Search fields** — `.c-search-bar.gp-search-bar` and descendants only; hero tokens for labels/inputs are set on `#site-search-bar` so directory matches without a `.gp-home` ancestor.
- **Page canvas behind results** — `body[data-screen-role="results"]` uses the same background progression as `.gp-home` (background → surface at ≥768px).

**Directory and category must match home;** do not introduce directory-only search or header styling when a shared rule can apply.

## Required band class

- **`.ds-container`** is the canonical wrapper for public main content that must align with the site header and footer (same horizontal edges).
- Legacy **`.container`** uses the **same** width, padding, and centering rules in CSS; **new public markup should use `.ds-container`** so admin-only `.container` usage stays obvious in templates.

## Numeric rules

| Rule | Token / value |
|------|------------------|
| Max width | `var(--layout-content-max-width)` → **1200px** (`--bp-max-xl`) |
| Gutters (default) | `var(--layout-gutter-x-sm)` → **24px** each side |
| Gutters (viewport ≥ 768px) | `var(--layout-gutter-x-md)` → **32px** each side |
| Safe area (≤ 767px) | `max(gutter, env(safe-area-inset-*))` on left/right |
| Centering | `margin-left/right: auto`, `width: 100%`, `box-sizing: border-box` |

## Header and footer

- **`views/partials/site_header.ejs`**: inner wrapper is **`ds-container app-top-app-bar__inner`** — same band as main.
- **`views/partials/site_footer.ejs`**: CTA and main footer blocks use **`ds-container`**.

## Search shell

- **`#site-search-bar`** with **`.gp-home-search-card`** fills the **content box** of its parent `.ds-container` (`width` / `max-width: 100%`). Home, directory, and category routes reuse the same shell classes and shared `.c-search-bar` / `.gp-search-bar` styles.
- **Desktop shell metrics** (radius, padding, border, shadow) live in a single `@media (min-width: 768px)` block for **`.gp-home-search-card`** — not under `.gp-home` only — so directory inherits the same values as the hero.

## Allowed exceptions

1. **Prose / reading width** — `.ds-container.content-article-page` and `.content-faq-page` set `max-width: min(720px, 100%)` while keeping band gutters.
2. **Full-bleed backgrounds** — e.g. `.pro-company-profile__shell`, `.wf-footer-cta` background paint edge-to-edge; inner content still uses `.ds-container` where applicable.
3. **Admin, gates, and internal tools** — use `.container` (or bespoke widths) and are **not** bound by this public contract.

## Out of scope

- Backend routes and data.
- Autocomplete / search behavior (only layout band is specified here).
