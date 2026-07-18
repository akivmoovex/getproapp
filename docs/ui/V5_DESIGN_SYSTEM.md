# BlessBoard V5 design system

**Date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591`  
**Phase:** Shared foundations only (no full-page redesigns)

## Stitch sources

| Screen | ID | Role |
|--------|-----|------|
| BlessBoard Visual System Specification | `c8d8352b1b95400cb25e32a79c2f0b2e` | Typography, color, spacing, radii, shadows, breakpoints, control heights |
| BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` | Buttons, forms, cards, empty states, nav/drawer notes |
| BlessBoard Public Visual System Board | `8f689e44024444839a9c3174f03d4101` | Component gallery (reference; Inter/#3b22b5 export **not** product tokens) |
| BlessBoard Logo & Header Spec | `7880f0e354c445729cc01125f1526603` | Header lockup reference |
| BlessBoard Desktop / Mobile Header Reference | `43d6d1cb110240c8aa7e5989386ea63b` / `2d430d9648cc404b88f7463e170aa3b5` | Header chrome |
| BlessBoard Powered by GetPro Logo | `503ff0d768f04d1db68b72ce309b040c` | Accent orange lockup |
| BlessBoard Church Logo | `59da7230441e46d387320a2b6ef32f5c` | Mark asset |

**Product decision:** Keep **Hanken Grotesk** + primary **`#6C5CE7`** (Sacred Modernity). Ignore Stitch HTML board Inter / `#3b22b5`.

## Files

| File | Purpose |
|------|---------|
| `public/blessboard/v5/design-tokens.css` | Single token source (`--bb-color-*`, spacing, type, radii, aliases `--bb-violet`…) |
| `public/blessboard/v5/design-system.css` | Shared primitives (`.bb-ds-*`) |
| `public/blessboard/v5/design-system.js` | Opt-in drawer/modal helpers (external, CSP-safe) |
| `views/blessboard/v5/partials/head-design-system.ejs` | Fonts + tokens + design-system CSS |
| `views/blessboard/v5/partials/icon.ejs` | Material Symbols wrapper |
| `views/blessboard/v5/partials/form-errors.ejs` | Error summary (`role="alert"`) |
| `views/blessboard/v5/partials/empty-state.ejs` | Empty state |
| `views/blessboard/v5/partials/flash-message.ejs` | Flash / status alerts |
| `views/blessboard/v5/partials/pagination.ejs` | Pagination |
| `views/blessboard/v5/partials/loading-state.ejs` | Loading |
| `views/blessboard/v5/partials/error-state.ejs` | Error panel |
| `views/blessboard/v5/partials/success-state.ejs` | Success panel |
| `views/blessboard/v5/partials/confirm-state.ejs` | Confirmation panel |

Shell CSS files (`tenant-public.css`, `member-portal.css`, `hq-admin.css`, `branch-admin.css`, `platform-admin.css`) no longer redefine brand colors; they consume tokens via `head-design-system`.

## Tokens (canonical)

| Token | Value |
|-------|-------|
| `--bb-color-primary` | `#6C5CE7` |
| `--bb-color-primary-hover` | `#5341CD` |
| `--bb-color-accent` | `#FF9800` (GetPro only) |
| `--bb-color-page` | `#FBF9F6` |
| `--bb-color-surface` | `#FFFFFF` |
| `--bb-color-surface-dim` | `#F2F0ED` |
| `--bb-color-ink` | `#1A1C1E` |
| `--bb-color-muted` | `#44474E` |
| `--bb-color-border` | `#D1DCE0` |
| `--bb-color-error` | `#B3261E` |
| `--bb-color-success` | `#0F766E` |
| `--bb-max` | `80rem` (1280px) |
| `--bb-control-h` | `3rem` (48px) |
| `--bb-radius` / `--bb-radius-sm` | `16px` / `8px` |
| Spacing | `4,8,16,24,32,48,64,96,128` via `--bb-space-*` |
| Breakpoints | Mobile `≤767`, Desktop `≥768`, shell nav drawer `900` |

Legacy aliases (`--bb-violet`, `--bb-ink`, `--bb-bg`, …) map to the canonical tokens so existing shell classes keep working.

## Shared components (opt-in)

Use `.bb-ds-*` classes and partials for **new** work. Do not mass-rewrite existing page markup in this phase.

- Buttons: `.bb-ds-btn--primary|secondary|ghost|danger`
- Forms: `.bb-ds-field`, `.bb-ds-input`, `.bb-ds-select`, `.bb-ds-textarea`
- Badges, cards, alerts, tables, pagination
- Modal/dialog shell: `.bb-ds-modal` + `data-bb-ds-modal-*`
- Drawer primitives: `.bb-ds-drawer` + `data-bb-ds-drawer-*` (does **not** replace `tenant-public.js` / portal toggles)
- States: empty / loading / error / success / confirm partials

## Icon strategy

- **Material Symbols Outlined**, 24px default, `font-variation-settings` FILL 0 / wght 400
- Partial: `<%- include('../partials/icon', { name: 'mail' }) %>`
- Decorative icons: `aria-hidden="true"`; meaningful: pass `label`

## Accessibility

- Visible `:focus-visible` ring (2px primary + soft halo)
- Touch targets ≥ 44px (`--bb-touch-min`)
- `prefers-reduced-motion` disables spinners/transitions
- Form errors: `role="alert"`, `aria-live="assertive"`, focusable summary
- Flash success/info: `role="status"`; errors: `role="alert"`
- Pagination: `nav` + `aria-current="page"`
- Contrast: ink `#1A1C1E` on warm page; white text on primary violet

## Usage

```ejs
<head>
  …meta…
  <%- include('../partials/head-design-system') %>
  <link rel="stylesheet" href="/blessboard/v5/…-shell.css" />
</head>
```

```ejs
<%- include('../partials/form-errors', { error: error }) %>
<%- include('../partials/empty-state', { title: 'No items', body: '…', icon: 'inbox' }) %>
<%- include('../partials/flash-message', { type: 'success', message: notice }) %>
<%- include('../partials/pagination', { page: 1, totalPages: 5, baseHref: '/path' }) %>
```

Optional script (only if using `data-bb-ds-drawer` / `data-bb-ds-modal`):

```html
<script src="/blessboard/v5/design-system.js?v=1" defer></script>
```

## Out of scope this phase

- Redesigning tenant public / portal page layouts
- Replacing stable shell nav markup or inline portal drawer scripts
- Apex marketing pages
- Changing auth/transfer/CSRF logic
