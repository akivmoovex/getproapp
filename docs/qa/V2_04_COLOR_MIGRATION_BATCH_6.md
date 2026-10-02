# V2.04 Color Migration — Batch 6

**Status:** COMPLETE  
**Branch:** V4  
**Base commit:** `8bd5bc8920b200998bff977fae20d32eae4e07f6` (Batch 5)  
**Theme source:** `src/platform/ui/theme/colors.css`  
**Date:** 2026-09-29  

## 1. Exact scope

ActiveClinic **public website / platform / patient-portal presentation** GUI colors.

**Not in scope:** staff app (Batch 3), website editor chrome (Batch 5), BlessBoard public (Batch 7), cleanup residue (Batch 8).

## 2. Files

| File | Role | Before | After |
| --- | --- | ---: | ---: |
| `public/activeclinic/acw-platform.css` | Apex ActiveClinic.org platform | 47 | 0 |
| `public/activeclinic/ac-public.css` | Tenant clinic public mini-site | 39 | 0 |
| `public/activeclinic/website-theme-family-wellness-mint.css` | Optional theme pack | 9 | 0 |
| `public/activeclinic/ac-patient.css` | Patient portal chrome | 5 | 0 |
| `views/activeclinic/app/patient-print-card-content.ejs` | Print ID card chrome | 3 | 0 |
| `public/activeclinic/ac-patient.js` | Client validation border colors | 2 | 0 |
| `public/activeclinic/ac-tokens.css` | Public `--acp-*` bridge (token file; not in scan count) | — | remapped |

**BATCH6_FILES = 6** (scannable) + token bridge update  
**BATCH6_RAW_COLORS_BEFORE = 105**  
**BATCH6_RAW_COLORS_AFTER = 0**  
**BATCH6_LOCATIONS_MIGRATED = 105**

## 3. Public routes / surfaces

Covered via `public-shell` / `patient-shell` CSS:

- Platform landing / directory (`acw-platform.css`)
- Tenant clinic home / about / services / doctors / contact / booking entry chrome (`ac-public.css`)
- Patient portal (`ac-patient.css`)
- Optional Family Wellness Mint theme pack
- Patient print card presentation

Shells set `data-product="activeclinic"` + `data-surface="public"` and load `head-platform-colors` before `ac-tokens.css`.

## 4. Semantic tokens used

`--color-background|surface|surface-subtle|text-*|border-*|brand-*|success*|warning*|danger*|info*|focus*|link*|modal-overlay` plus public aliases `--acp-*` / `--ac-status-*`.

## 5. Brand-token decisions

| Alias | Resolves to |
| --- | --- |
| `--acp-primary*` | `--color-brand-primary*` (public teal via `data-surface="public"`) |
| `--acp-navy` | `--color-brand-accent` |
| `--acp-ink/muted/surface/bg/border` | platform text/surface/border |
| `--ac-status-*` | platform success/warning/danger/info |

No page-specific `--clinic-*-blue` APIs.

## 6. Tenant-branding classification

| Mechanism | Treatment |
| --- | --- |
| `public-shell.ejs` runtime `--acp-primary` from `clinic.brandPrimary` / accent | **TENANT_BRANDING** preserved |
| Wellness Mint theme pack overrides `--acp-*` under `body.gp-website-theme--*` | Theme branding via **var-defs** (not scannable property literals); properties consume vars |
| HEX fallbacks `var(--acp-primary, #006a6a)` | Removed → `var(--acp-primary)` (platform default when unset) |

**TENANT_BRANDING_RETAINED (scannable remaining) = 0**  
Theme/runtime overrides remain functional.

## 7. Retained raw colors

None in Batch 6 scannable property usages.

`JUSTIFIED_DECORATIVE = 0` · `MISSED_MIGRATION = 0`

## 8. Before / after counts

| Metric | Value |
| --- | ---: |
| REPO_BEFORE | 426 |
| REPO_AFTER | **321** |
| Migrated | 105 |
| TOTAL_REMOVED_FROM_FOUNDATION | **970** (`1291 − 321`) |
| COUNT_CONSISTENCY | **PASS** (`426 − 105 = 321`) |

## 9. Intentional visible changes

1. Status/capability badge greens/reds/ambers consolidated onto platform success/warning/danger families.
2. Public HEX fallbacks removed; unset brand uses platform public teal (`#006068` via brand tokens) instead of drifted literals (`#006a6a`, `#003c90`).
3. Shadows use `color-mix` against text/brand tokens.

Layout/type/copy unchanged.

## 10. Accessibility

Focus rings use `--color-focus-ring`; danger/success text use platform AA-oriented status tokens; inverse text on primary CTAs via `--color-text-inverse`.

`ACCESSIBILITY=PASS` · `NEW_ACCESSIBILITY_RISKS=0`

## 11. Responsive

Public/platform CSS retains existing `@media` structure; no layout token changes. `RESPONSIVE_REGRESSION=PASS`.

## 12–13. Regression

| Check | Result |
| --- | --- |
| AC_PUBLIC_REGRESSION | PASS (shells + token wiring + tests) |
| AC_THEME | PASS (public teal via surface selector) |
| BB_REGRESSION_GUARD | PASS (no BlessBoard public CSS modified) |
| VISUAL_PARITY | PASS (semantic consolidation only) |

## 14. Token health

`UNDEFINED_TOKENS=0` · `CIRCULAR_REFERENCES=0` · `MAX_ALIAS_CHAIN_AFTER=4` · `COMPATIBILITY_ALIASES=17`  
`NEW_COMPONENT_TOKENS=0` · `NEW_DOMAIN_TOKENS=0`

## 15. Remaining-scope reconciliation

| Scope | Count |
| --- | ---: |
| BATCH_7_BB_PUBLIC | 150 |
| BATCH_8_CLEANUP | 149 |
| OUT_OF_SCOPE_OR_JUSTIFIED | 22 |
| **Sum** | **321** |

`REMAINING_SCOPE_RECONCILIATION=PASS`

## 16. Worktree integrity

Branch `V4`; unrelated V8/V7 stashes untouched; diff limited to Batch 6 + docs/tests.

`WORKTREE_INTEGRITY=PASS`

## 17. Tests

- `tests/v2-04-color-migration-batch-6.test.js`
- Extended `tests/v2-04-color-token-resolution.test.js`
- Prior V2.04 suites

`TESTS=PASS`

## 18. Risks / debt

- Wellness Mint still hard-codes theme HEX inside **custom-property definitions** (intentional theme pack). Candidates to move to named theme primitives in Batch 8 if desired.
- `--acp-*` alias layer remains for public CSS readability; optional later collapse to `--color-*` / `--button-*` direct usage.
