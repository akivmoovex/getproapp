# Design system (Material Design 3)

## Files

| File | Role |
|------|------|
| **`public/theme.css`** | Global tokens only: `--color-*`, `--space-1`…`--space-5` (8px grid), `--spacing-*` (legacy aliases), `--border-radius-*`, `--typo-*`, `--elevation-*`, `--md-sys-*`, legacy aliases (`--wf-primary`, `--bg`, …), optional `.app-layout` / `.card--elevated`. |
| **`public/m3-modal.css`** | **Single M3 modal shell** (`.m3-modal-overlay`, `.m3-modal`, header/body/footer, open/close animation). Imported by `styles.css` after `theme.css`. |
| **`public/styles.css`** | `@import "./theme.css"` and `@import "./m3-modal.css"` then all components, pages, and layout rules. **Templates link only `/styles.css`** — the import loads the theme in one cascade. |
| **`public/theme-colors.css`** | Stub / pointer for diffs; not loaded by the app. |

## Semantic tokens (use in new CSS)

- **Color:** `--color-primary`, `--color-on-primary`, `--color-background`, `--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-error`, …
- **Spacing:** `--space-1` … `--space-5` (**8, 16, 24, 32, 40**). Legacy `--spacing-*` maps to this grid.
- **Modals:** use only `.m3-modal-overlay` + inner `.m3-modal` structure (see `docs/MODALS.md`).
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
