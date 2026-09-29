# V2.04 ActiveClinic Theme Alias Scope Hotfix

**Version:** 2.04  
**Branch:** V4  
**Fix:** `AC_THEME_ALIAS_SCOPE`  
**Pre-fix SHA:** `e06631f39027ec9da9095484322b425d617c18be`  
**Status:** Local gates PASS · **awaiting neuniversity.org redeploy** for hosted re-smoke  
**Production / pronline V10:** UNTOUCHED  

## Hosted symptom (release blocker)

On `blessboard.neuniversity.org` / `activeclinic.neuniversity.org` (`moovex-platform-v8-testing`, V4 `e06631f39027`):

- `data-product="activeclinic"` and `--color-brand-primary=#006068` were correct on `<body>`.
- Primary controls still rendered BlessBoard violet `#6c5ce7` / `rgb(108, 92, 231)`.

Affected surfaces (observed):

| Route | Control | Class |
| --- | --- | --- |
| `/` | Get Started | `.ac-btn--primary` |
| `/clinics/julflona-clinic` | Book Appointment | `.ac-btn--primary` |
| `/login` | Log in | `.ac-auth-btn` |

BlessBoard remained correctly violet. `BB_TOKEN_LEAK_INTO_AC=1`, `AC_TOKEN_LEAK_INTO_BB=0`.

## Root cause (CSS cascade)

Custom properties **inherit computed values**, not unresolved `var()` chains.

Pattern that failed:

```css
:root {
  --color-brand-primary: var(--palette-violet-500); /* default */
  --button-primary-bg: var(--color-brand-primary);  /* resolves to #6c5ce7 on :root */
  --acp-primary: var(--color-brand-primary);        /* same */
}
body[data-product="activeclinic"] {
  --color-brand-primary: var(--palette-teal-700);   /* #006068 on body only */
}
.ac-btn--primary { background: var(--acp-primary); } /* inherited #6c5ce7 from :root */
```

`--color-brand-primary` on the body was teal, but `--acp-primary`, `--button-primary-bg`, and `--ac-auth-primary` were still the **frozen violet** assigned on `:root`.

## Architecture correction

1. **`src/platform/ui/theme/colors.css`** — Added section **I. PRODUCT-SCOPE COMPONENT ALIAS REBIND** re-declaring product-sensitive component tokens (`--button-*`, `--input-*`, `--nav-*`, `--editor-*`, etc.) on product scopes so `var(--color-brand-primary)` resolves against the cascaded product brand on the same element.

2. **`public/activeclinic/ac-tokens.css`** — Moved `--acp-*` and `--product-*` color aliases off `:root` onto ActiveClinic product/body scopes.

3. **`public/activeclinic/ac-auth.css`** — Moved `--ac-auth-*` color aliases onto `body.ac-auth-body[data-product="activeclinic"]`.

4. **`public/activeclinic/ac-app-tokens.css`** — Moved staff `--ac-*` / `--gp-ops-*` color aliases onto `[data-product="activeclinic"]` / `body.ac-app-body` (staff blue via `data-surface="staff"`).

5. **`public/blessboard/v5/design-tokens.css`** — Moved `--bb-color-*` / `--product-*` color aliases onto `[data-product="blessboard"]` (non-color metrics remain on `:root`).

6. Mirrored **`public/platform/theme/colors.css`** from `src/platform/ui/theme/colors.css`.

No component hard-coded teal/violet literals. No `!important`. No layout/copy changes.

## Alias audit (pre-fix inventory)

| Metric | Count |
| ---: | ---: |
| `ROOT_LEVEL_ALIASES_REVIEWED` | **480** |
| `PRODUCT_SENSITIVE_ROOT_ALIASES` (pre-fix) | **119** |
| `PRODUCT_SENSITIVE_ALIAS_SCOPE_ERRORS_AFTER` | **0** (Playwright computed chain) |

## Regression test

Added **`tests/v2-04-product-token-cascade.test.js`** (Playwright computed styles):

- AC public: `--acp-primary`, `--ac-auth-primary`, `--button-primary-bg` → `#006068`; CTA backgrounds teal.
- BB: `--bb-color-primary` → `#6c5ce7`.
- AC staff: `--ac-primary` → `#2563eb`.

`PRODUCT_TOKEN_RESOLUTION_TEST=PASS`

## Local verification

| Gate | Result |
| --- | --- |
| `AC_PRIMARY_BRAND` | `#006068` |
| `AC_PRIMARY_CTA_RESOLUTION` | **PASS** |
| `BB_PRIMARY_BRAND` | `#6c5ce7` |
| `BB_THEME_REGRESSION` | **PASS** |
| `AC_THEME_REGRESSION` | **PASS** |
| V2.04 batches 1–8 + resolution + cascade + design-system + AC auth HTTP | **56/56 PASS** |
| `REPO_HARDCODED_COLORS` | **41** |
| `UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS` | **0** |
| `UNDEFINED_TOKENS` / `CIRCULAR_REFERENCES` | **0** |
| `MAX_ALIAS_CHAIN` | **2** |

## Accessibility

AC primary CTAs move from incorrect violet to intended teal `#006068` with white on-primary text (same contrast class as design intent). `ACCESSIBILITY=PASS`, `NEW_ACCESSIBILITY_RISKS=0`.

## Hosted QA follow-up

Previous hosted smoke: **`V2_04_COLOR_THEME_HOSTED_QA_BLOCKED`**.  
After operator redeploys this commit to **neuniversity.org only**, re-run final hosted color-theme smoke (do not change pronline V10).

## Production safety

No production deploy, env, DB, or media changes. pronline.org remains V10 `05b2afe1caff`.
