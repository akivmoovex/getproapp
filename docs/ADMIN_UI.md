# Admin console UI patterns

This app uses **one stylesheet** (`public/styles.css`) for both the public site and the admin UI. **Design tokens** live in [`theme.css`](../public/theme.css) and [`design-system.css`](../public/design-system.css); see [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). Admin layout is scoped with `.admin-app`, `.admin-main`, and **CSS variables** under `:root` with the `--admin-*` prefix so grids, cards, tables, and modals stay consistent. **Material Design 3** spacing, elevation, and surfaces use the `--md-sys-*` tokens (see [`MATERIAL_DESIGN_3.md`](./MATERIAL_DESIGN_3.md)).

## Database files (`data/`)

The app opens **only** the path from `SQLITE_PATH` or the default **`data/getpro.sqlite`** (see `src/db.js`).

If you see files like **`netraz.sqlite`**, **`pronline.sqlite`**, or other extra `*.sqlite` / `*.db` names in `data/`, they are **not** referenced by GetPro unless `SQLITE_PATH` points at them. Remove the matching **`-wal`** and **`-shm`** files when deleting an unused database. Keep a backup first if unsure.

## Tokens (see `:root` in `theme.css` / `design-system.css`, imported by `styles.css`)

| Token | Role |
|--------|------|
| `--admin-radius`, `--admin-radius-lg` | Cards, panels, inputs in admin |
| `--admin-gap`, `--admin-gap-section` | Flex/grid gaps between blocks |
| `--admin-main-pad-*` | `.admin-main__pad` vertical rhythm |
| `--admin-card-padding` | Default padding inside `.admin-main .card` |
| `--admin-container-max` | Legacy alias for `--layout-content-max-width` (global layout band) |
| `--admin-modal-max-width` | Settings hub / embed modal dialog width cap |
| `--admin-modal-max-height-vh` / `-px` | Modal height (`min(vh, px)`) |

## Components

- **Dashboard:** `.admin-dashboard__kpis`, `.admin-dashboard-panel`, `.admin-dash-bars` / `.admin-dash-status` — overview metrics, 7-day lead bars, status distribution (see `views/admin/dashboard.ejs`).
- **Grids:** `.admin-settings-hub__grid`, `.admin-filter-form__grid` — use `repeat(auto-fill, minmax(...))` and `--admin-gap`.
- **Cards:** `.admin-main .card` — shared border-radius and padding via tokens; CRM uses `.crm-task-section` for task-specific density.
- **Tables:** `.table`, `.table-wrap`, `.admin-settings-tenant-table` — keep cell padding aligned with `--admin-table-cell-padding` where overridden.
- **Popups:** `.admin-settings-modal__dialog` — size driven by `--admin-modal-*`; **header row** (`.admin-settings-modal__header`) holds title + close; iframe fills the area **below** (no overlapping ×). See [`MODALS.md`](./MODALS.md).

When adding new admin screens, prefer these classes and variables instead of one-off `padding`/`max-width` values.
