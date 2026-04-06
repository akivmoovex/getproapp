# Archived one-off scripts

These tools were used for past migrations or CSS refactors. They are **not** part of normal builds or deploys. Paths inside each script assume they live in `scripts/archive/` (repo root is two levels up).

| Script | Notes |
|--------|--------|
| `migrate-btn-buttons.mjs` | Button → partial migration (already applied). Unsafe to re-run on EJS-heavy tags. |
| `migrate-btn-anchors-pass1.mjs` | Anchor “btn” pass (already applied). |
| `tokenize-styles-css.py` | Replaced px literals with tokens in `public/styles.css`. |
| `fix-media-vars-in-styles.py` | Replaced `var()` inside `@media` with px (CSS limitation). |
