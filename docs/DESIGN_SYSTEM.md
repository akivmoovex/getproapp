# Design system (Material Design 3)

## Files

| File | Role |
|------|------|
| **`public/theme.css`** | Global tokens only: `--color-*`, `--spacing-*`, `--border-radius-*`, `--typo-*`, `--md-sys-*`, legacy aliases (`--wf-primary`, `--bg`, …), optional `.app-layout` / `.card--elevated`. |
| **`public/styles.css`** | `@import "./theme.css"` then all components, pages, and layout rules. **Templates link only `/styles.css`** — the import loads the theme in one cascade. |
| **`public/theme-colors.css`** | Stub / pointer for diffs; not loaded by the app. |

## Semantic tokens (use in new CSS)

- **Color:** `--color-primary`, `--color-on-primary`, `--color-background`, `--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-error`, …
- **Spacing:** `--spacing-1` … `--spacing-8` (alias of `--md-sys-spacing-*` where defined).
- **Radius:** `--border-radius-xs` … `--border-radius-full`; legacy `--radius` → `--border-radius-md`.
- **Typography:** `--typo-body-large-size`, `--typo-title-large-size`, `--font-family-body`, …
- **Elevation:** `--md-sys-elevation-level0` … `level5`.

Legacy names (`--wf-primary`, `--muted`, `.btn`, `.card`) remain supported across the app.

## Components (class contracts)

| Pattern | Classes | Notes |
|---------|---------|--------|
| **Primary button** | `.btn.btn-primary` | Filled; min-height 44px+ in styles. |
| **Secondary / outline** | `.btn` | Border + surface; hover uses `--primary-softer-bg`. |
| **Text-style action** | `.btn.btn--text` (low emphasis; primary-colored label, transparent background). |
| **Cards** | `.card`, `.card--elevated` | Default elevation level 1; modifier adds level 2. |
| **Layout shell** | `.app-layout`, `.app-layout__main` | Optional wrapper for header / main / footer pages. |
| **Admin** | `.admin-app`, `.admin-main`, `.container` | Unchanged; use `--admin-*` and `--md-sys-*` tokens. |

## Refactor guidelines

1. Prefer **tokens** over hex/`px` in new rules.
2. **Inline `style=`** in EJS: replace with utility classes or token-based rules when touching a file.
3. **No new JS/CSS frameworks** — stay on vanilla CSS + EJS.

## Accessibility

- Base body uses readable **line-height** (`--typo-body-large-line`).
- **Reduced motion:** global rule in `styles.css` short-circuits animations when `prefers-reduced-motion: reduce`.
