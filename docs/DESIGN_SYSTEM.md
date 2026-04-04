# GetPro Design System V1

**Philosophy:** minimal, professional, calm, trustworthy, content-first, card-first for directory experiences, Material 3–inspired without heavy frameworks.

## Implementation (real standard)

| File | Role |
|------|------|
| **`public/theme.css`** | **Authoritative tokens** — colors, legacy spacing (`--space-*`), typography, elevation, tenant themes, M3 bridge (`--md-sys-*`). **Edit here when changing palette.** |
| **`public/design-system.css`** | **DS V1 canonical aliases** (`--color-bg`, `--radius-lg`, `--gp-ds-space-*`, focus utilities). Loaded immediately after `theme.css`. |
| **`public/m3-modal.css`** | M3 modal shell (see `docs/MODALS.md`). |
| **`public/styles.css`** | Imports `theme.css` → `design-system.css` → `m3-modal.css`, then all components. **Templates link only `/styles.css`.** |

## Color tokens

Use **semantic** names in new CSS. Prefer `var(--color-*)` / DS aliases over hex.

| Token | Role |
|-------|------|
| `--color-bg` / `--color-background` | Page background |
| `--color-surface` | Cards, panels |
| `--color-surface-alt` / `--color-surface-variant` | Subtle alternate surfaces |
| `--color-text` | Primary text |
| `--color-text-muted` / `--color-text-soft` | Secondary / tertiary text |
| `--color-primary` | Brand accent |
| `--color-primary-hover` | Hover state |
| `--color-primary-soft` | Tinted backgrounds |
| `--color-border` / `--color-border-strong` | Hairlines and emphasis |
| `--color-success` | Positive states |
| `--color-error` | Errors / destructive emphasis |
| `--color-warning` | Caution |
| `--color-focus` | Focus ring base |

**Rules:** light neutrals, restrained violet accent, subtle borders, no loud gradients on routine UI.

## Spacing

- **Layout (existing app scale):** `--space-1` … `--space-5` and extended `--space-*` — **8px-based rhythm** used across the codebase. Do not replace wholesale.
- **DS V1 4px reference scale:** `--gp-ds-space-1` (4px) … `--gp-ds-space-12` (48px) — use for **new** rules when the spec calls for 4/8/12px steps; map to `--space-half`, `--space-1`, etc. when they align.

## Public layout band (v2)

- **`--layout-content-max-width`** — canonical max width for marketing/directory content (maps to `--bp-max-xl`, 1200px).
- **`--layout-gutter-x-sm` / `--layout-gutter-x-md`** — horizontal padding inside the band below / at or above 768px (24px / 32px). **`.container`**, **`.gp-home-container`**, and **`.ds-layout-public`** share one ruleset in `public/styles.css` (global layout band); avoid ad hoc `padding-inline` on those nodes.
- **`--layout-field-stack-gap`** — default vertical gap between stacked labels and controls in dense toolbars (e.g. directory meta under search).
- **`--control-height-comfortable`** (48px) and **`--control-touch-min`** (44px) — Material-aligned touch targets for search inputs and list options.
- **Search shell:** `--search-field-radius`, `--elevation-autocomplete`, **`--z-index-autocomplete`** — shared home + directory combobox surfaces.

## Radius

| Token | Typical use |
|-------|-------------|
| `--radius-sm` | Small controls |
| `--radius-md` | Inputs, buttons |
| `--radius-lg` / `--radius-xl` | Cards, toolbars, modals |

## Elevation

Prefer **`--elevation-sm`** and **`--elevation-md`** for cards and surfaces. Avoid heavy shadows.

## Typography

- **Font:** `Inter` via `--font-family` / `--font-family-body`.
- **Scale:** `--text-xs` … `--text-xl` in `design-system.css`; existing `--typo-*` tokens remain in `theme.css`.

## Components (BEM)

### Directory professional card

**Block:** `.pro-directory-card`  
**Elements:** `__link`, `__title`, `__cta`, `__meta-line`, `__excerpt`, `__footer`, …

**Rules:** left-aligned text, large radius (`--radius-lg`), surface background, subtle hover (border + `--elevation-md` only). Full card is one link — no nested buttons.

### Search / filter toolbar

**Block:** `.pro-directory-toolbar`  
**Elements:** `__fields`, `__meta`, `__chip`, `__submit`, …

**Rules:** compact, horizontal on desktop, stack on mobile; must not overpower result cards.

### Buttons

| Role | Classes |
|------|---------|
| Primary | `.btn.btn--primary` (legacy alias: `.btn.btn-primary`) |
| Secondary / outline | `.btn.btn--secondary` (legacy alias: `.btn.btn-secondary-wf`) |
| Ghost / text | `.btn.btn--text` |

**Rules:** contextual labels (“View profile”, “Request a call”), not vague “Submit” unless unavoidable.

### Forms

Use visible labels and the shared field shell where practical: `.input-field`, `.input-field__label`, `.input-field__control`, `.input-field__help`, `.input-field__error`. Join/callback flows may also use `join-modal-*` classes alongside those primitives. Admin/internal compact flows may use `.form-step.form-step--admin` with `.form-step__body` / `.form-step__actions` for grouping (not a multi-step wizard). Focus must be visible (`--focus-ring-color`).

### Flash & inline feedback (admin / app)

- **Default** `.flash` — validation / login / form errors (error-colored surface; use `role="alert"` for errors).
- **`.flash.flash--success`** — post-save confirmation (calm green tint; `role="status"`, `aria-live="polite"`).
- **`.flash.flash--info`** — non-blocking guidance (primary-tinted neutral surface; `role="status"`, `aria-live="polite"`).
- **`.form-status-message`** — compact inline status under forms (e.g. request-contact); not a full-width banner.

Tokens: `--flash-error-*`, `--flash-success-*`, `--flash-info-*` in `public/theme.css`.

**Query success (admin):** Some routes append `?saved=1` (and `embed=1` when embedded). List/edit pages show a full-width **“Changes saved.”** line using `.flash.flash--success` (`role="status"`, `aria-live="polite"`). Examples: tenant user edit, super user edit, companies list after company save.

### UI state blocks & inline status (shared)

Use this layer for **repeatable** loading / success / error / empty / info surfaces **without** replacing page-level `.flash` (keep `.flash` for top-of-page redirects and errors).

**Block pattern** — `public/design-system.css`:

| Modifier | Use |
|----------|-----|
| `.state-block` | Base padded surface (border + radius + token spacing). |
| `.state-block--loading` | Spinner row; pair with `partials/components/loading_block.ejs`. |
| `.state-block--success` | Calm confirmation (uses `--flash-success-*`). |
| `.state-block--error` | Recoverable / inline error block (uses `--flash-error-*`). |
| `.state-block--info` | Neutral guidance. |
| `.state-block--empty` | No results / empty list (dashed border, muted fill). |
| `.state-block--compact` | Tighter padding. |
| `.state-block--admin-inline` | Table cell or tight admin row: transparent background, no border, centered copy. |

**Elements:** `.state-block__title`, `.state-block__body`, `.state-block__body--muted`, `.state-block__actions`, `.state-block__loading-inner`, `.state-block__spinner`, `.state-block__loading-text`.

**EJS partials** (`views/partials/components/`):

- **`state_block.ejs`** — generic block (`variant`, `title`, `body`, `bodyMuted`, `compact`, `id`, `hidden`, `extraClass`, optional trusted `actions` HTML).
- **`empty_state.ejs`** — convenience wrapper for `variant: empty` (params: `title`, `hint`, `compact`, `extraClass`, …).
- **`loading_block.ejs`** — compact loading row (default `compact: true`).
- **`status_message.ejs`** — optional SSR helper; many flows keep a single `<p>` with classes instead.

**Inline status** — add `.status-message` next to `.form-status-message` and a modifier: `.status-message--success` | `--error` | `--info` | `--loading` | `--neutral`. JS may toggle modifiers on one element (e.g. `#lead_status` via `setLeadStatus` in `public/scripts.js`).

**Copy tone:** short, calm, specific (“Sending request…”, “Thanks—we’ve received your request.”). Avoid alarmist language for success; errors should say what failed and imply retry when appropriate.

### Empty states

Prefer **`empty_state.ejs`** / `.state-block--empty` for **empty lists and no-results** when you need a reusable shell. Headline → short explanation → primary CTA → optional secondary action. Tone: reassuring, not error-like unless it is an error. Directory no-results still use the richer `.pro-directory-empty` card; inner callback success/loading align with `state-block` classes.

## Layout

- **Directory grid:** 1 col → 2 → 3 columns via container queries (`.pro-directory-results`).
- **Max width:** follow `.container` / `--layout-max-admin` for admin.

## Interaction

- **Hover:** subtle border or shadow only — no aggressive scale.
- **Focus:** always visible; use `--focus-ring-color` or `.gp-focus-ring` for custom controls.
- **Clickable cards:** `cursor: pointer` only on the actual link; prefer `<a href>` for navigation.

## Copy & terminology

- **Directory entries:** prefer **“professional”** in user-facing directory copy (not mixed with “vendor”, “provider”, “pro” unless context requires).
- **Contact field:** prefer **“Phone number”** for consistency.
- **Admin:** “Companies” may remain in data/admin labels where it matches the model; user-facing directory strings should say **professional** where it describes a person/business listing.

## Do / don’t

**Do:** use tokens, reuse blocks above, keep UI calm, refactor incrementally.  
**Don’t:** hardcode colors/spacing in new rules, add heavy JS frameworks, or one-off duplicate components without reason.

**Performance-aware UI work:** see **`docs/performance-aware-development-rules.md`** (when to treat a PR as perf-sensitive, PR checklist, links to **`docs/route-asset-inventory.md`** and **`docs/performance-budgets.md`**).

## Accessibility

Readable line-heights, `prefers-reduced-motion` respected in `styles.css`, visible focus.
