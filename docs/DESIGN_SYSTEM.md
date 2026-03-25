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

### Empty states

Headline → short explanation → primary CTA → optional secondary action. Tone: reassuring, not error-like unless it is an error.

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

## Accessibility

Readable line-heights, `prefers-reduced-motion` respected in `styles.css`, visible focus.
