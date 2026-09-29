# Platform Color System (V2.04)

Canonical source: `src/platform/ui/theme/colors.css`  
Runtime mirror: `public/platform/theme/colors.css` → `/platform/theme/colors.css`  
Audit basis: `docs/qa/V2_04_GUI_COLOR_THEME_AUDIT.md`  
Migration plan: `docs/qa/V2_04_COLOR_TOKEN_MIGRATION_PLAN.md`

## 1. Purpose

Provide **one shared color token architecture** for GetPro products while preserving distinct **BlessBoard** and **ActiveClinic** brand identities.

Products must **not** be forced to share brand primaries. They share a **semantic vocabulary** (background, text, borders, success/warning/danger/info, buttons, inputs, nav, etc.).

## 2. Token hierarchy

```
PLATFORM PRIMITIVES
        ↓
PLATFORM SEMANTIC TOKENS
        ↓
PRODUCT BRAND TOKENS
        ↓
COMPONENT TOKENS
        ↓
APPLICATION UI
```

| Layer | Examples | Who consumes |
| --- | --- | --- |
| Primitives | `--palette-violet-500` | Theme authors only |
| Platform semantic | `--color-text-primary`, `--color-danger` | Rarely direct; prefer component tokens |
| Product brand | `--color-brand-primary` | Theme + component mapping |
| Component | `--button-primary-bg`, `--input-border` | **Application UI (preferred)** |

## 3. Primitive vs semantic tokens

**Primitives** are raw scales. Do not use them in feature CSS merely because they “look right.”

**Semantic tokens** encode **purpose** (error text, page canvas, primary button). Choose by intent, not by HEX similarity.

> **NEW APPLICATION UI MUST NOT INTRODUCE RAW HEX/RGB/HSL COLORS WHEN AN APPROPRIATE PLATFORM TOKEN EXISTS.**

> **DO NOT use a primitive token merely because it visually matches. Choose colors by SEMANTIC PURPOSE.**

## 4. Shared platform colors

Neutral and status tokens live on `:root` in `colors.css`:

- Surfaces: `--color-background`, `--color-surface`, `--color-surface-subtle`, `--color-surface-elevated`
- Text: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-text-inverse`
- Borders: `--color-border-default`, `--color-border-subtle`, `--color-border-strong`
- Disabled: `--color-disabled-bg`, `--color-disabled-text`, `--color-disabled-border`
- States: `--color-success*`, `--color-warning*`, `--color-danger*`, `--color-info*`

Status colors deliberately consolidate audit drift (multiple greens/reds/warnings) into one platform family.

## 5. BlessBoard brand colors

Activated by:

- Preferred: `data-product="blessboard"`
- Compatibility: `data-bb-product`, `data-gp-product="blessboard"`

| Token | Value | Notes |
| --- | --- | --- |
| `--color-brand-primary` | `#6C5CE7` | Sacred Modernity violet |
| `--color-brand-primary-hover` | `#5341CD` | |
| `--color-brand-primary-active` | `#3D348B` | |
| `--color-brand-primary-light` | `#EFEAFF` | Soft containers |
| `--color-brand-accent` | `#FF9800` | Decorative / logos only |
| `--color-brand-accent-readable` | `#C2410C` | Small text lockups (Powered by GetPro) |
| Page tint | `#FBF9F6` | Warm background |

## 6. ActiveClinic brand colors

Activated by:

- Preferred: `data-product="activeclinic"`
- Compatibility: `data-ac-product="activeclinic"`, `data-gp-product="activeclinic"`

### Public / portal / auth (teal) — default AC brand

| Token | Value |
| --- | --- |
| `--color-brand-primary` | `#006068` |
| `--color-brand-primary-hover` | `#0F766E` |
| `--color-brand-primary-active` | `#004F56` |
| `--color-brand-primary-light` | `#D5FAFF` |
| `--color-brand-accent` | `#213145` (navy) |
| Page tint | `#F8F9FF` |

Surface hints: `data-surface="public"`, `data-ac-shell="public|auth|patient"`.

### Staff app (blue ODS)

Override when `data-surface="staff"`, `data-ac-shell="staff-app"`, or `body.ac-app-body`:

| Token | Value |
| --- | --- |
| `--color-brand-primary` | `#2563EB` |
| `--color-brand-primary-hover` | `#1D4ED8` |
| `--color-brand-primary-light` | `#EFF6FF` |
| Page tint | `#F8FAFC` |

## 7. Component tokens

Preferred API for UI:

- Buttons: `--button-primary-*`, `--button-secondary-*`, `--button-danger-*`
- Inputs: `--input-*`
- Cards: `--card-*`
- Navigation: `--nav-*`
- Tables: `--table-*`
- Modals: `--modal-*`
- Badges: `--badge-success-*` … map to semantic states

## 8. Naming conventions

- `--palette-*` — primitives only
- `--color-*` — platform semantic + brand
- `--button-*` / `--input-*` / `--card-*` / `--nav-*` / `--table-*` / `--modal-*` / `--badge-*` — component layer
- Avoid product-prefixed new names (`--bb-*`, `--ac-*`) for **new** shared UI; keep legacy product files until migration batches complete
- Avoid appearance-named application tokens (`--bb-violet`, `--ac-teal`). Prefer `--color-brand-primary` / `--bb-color-primary` / `--ac-brand-accent`. Hue-named **compat aliases** may remain until Batches 5–8 finish.
- Publication lifecycle aliases (`--status-published|draft|inactive-*`) resolve to `--badge-success|warning|neutral-*`. Prefer badge tokens in new CSS.

Correction-gate validation: `tests/v2-04-color-token-resolution.test.js` (undefined color refs, circular chains, product-domain leakage).

## 9. Accessibility rules

Target WCAG AA for critical text/control combinations where reasonably possible.

Token-level mitigations from the V2.04 audit:

| Audit risk | Foundation response |
| --- | --- |
| `#FF9800` on white (FAIL for text) | Use `--color-brand-accent-readable` for text; keep `#FF9800` decorative |
| Disabled `#9A93A8` on page (FAIL) | `--color-disabled-text` = `#6B7280` |
| Platform subtle `#8A94A6` (FAIL) | `--color-text-muted` = `#6B7280` |
| Staff success/danger soft chips (LARGE_ONLY) | Shared `--color-success-text` / `--color-danger-text` use stronger `#027A48` / `#BA1A1A` |

Do **not** silently change major brand primaries solely for contrast. Derive role-specific readable variants instead.

Also: disabled state must not rely on color alone.

## 10. How developers should select colors

1. Identify the **role** (primary button, error text, card border, page canvas).
2. Prefer a **component token** (`--button-primary-bg`).
3. If none fits, use a **semantic token** (`--color-danger-text`).
4. Never copy HEX from another product’s brand into shared components.
5. Never introduce a new HEX when an existing token already covers the role.

### Examples

**BAD**

```css
.button {
  background: #2563eb;
  color: #ffffff;
}
```

**BETTER**

```css
.button {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}
```

**BAD**

```css
.error {
  color: #dc2626;
}
```

**BETTER**

```css
.error {
  color: var(--color-danger-text);
}
```

## 11. Prohibited patterns

- Raw HEX/RGB/HSL in new feature CSS when a token exists
- Using primitives (`--palette-*`) in feature CSS for “convenience”
- Forcing BlessBoard violet onto ActiveClinic (or reverse)
- Using brand accent orange for small body text
- Using brand primary as the only “info” color in shared components (use `--color-info*`)
- Editing `public/platform/theme/colors.css` without updating the canonical `src/platform/ui/theme/colors.css` (keep mirrors identical)

## 12. Migration strategy

Foundation only is shipped in V2.04 first commit. Existing product CSS (`design-tokens.css`, `ac-tokens.css`, `church.css`, etc.) still drives most visuals.

Controlled batches are listed in `docs/qa/V2_04_COLOR_TOKEN_MIGRATION_PLAN.md`. Do not repository-wide replace literals without a batch plan and visual QA.

### Theme loading (rendering pipeline)

1. Shared partial: `views/platform/partials/head-platform-colors.ejs`
2. Included early in:
   - BlessBoard V5: `views/blessboard/v5/partials/head-design-system.ejs` (all V5 shells + apex login)
   - BlessBoard legacy church shells: `views/church/partials/*_shell_start.ejs`
   - ActiveClinic: `views/activeclinic/layouts/{public,auth,patient,app}-shell.ejs`
   - Platform forms / announcements layouts
3. Product / shell CSS loads **after** the platform color system
4. Product brand activates via `data-product` (preferred) plus legacy `data-bb-product` / `data-ac-product` / `data-gp-product`

### Mirror maintenance

After editing `src/platform/ui/theme/colors.css`, copy to `public/platform/theme/colors.css` (tests assert byte identity).
