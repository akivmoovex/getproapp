# V2.04 Color Migration — Batch 7

**Status:** COMPLETE  
**Branch:** V4  
**Base commit:** `92450089be3a64fa65d3506fe5cc28b9486748b1` (Batch 6)  
**Theme source:** `src/platform/ui/theme/colors.css`  
**Date:** 2026-09-29  

## 1. Exact scope

BlessBoard **public website** GUI/presentation colors (apex marketing + tenant church mini-sites + optional theme pack).

**Not in scope:** authenticated BB admin/member (Batch 4), website editor chrome (Batch 5), ActiveClinic public (Batch 6), Batch 8 cleanup residue.

## 2. Files

| File | Role | Before | After |
| --- | --- | ---: | ---: |
| `public/blessboard/v5/tenant-public.css` | Tenant church public mini-site | 71 | 0 |
| `public/blessboard/v5/apex.css` | BlessBoard.com apex marketing | 65 | 0 |
| `public/blessboard/v5/website-theme-contemporary-fellowship.css` | Optional theme pack | 14 | 0 |
| `public/blessboard/v5/design-tokens.css` | BB bridge (token-hint excluded) | — | `--bb-shadow-lg` added |

**BATCH7_FILES = 3** (scannable) + design-tokens bridge  
**BATCH7_RAW_COLORS_BEFORE = 150**  
**BATCH7_RAW_COLORS_AFTER = 0**  
**BATCH7_LOCATIONS_MIGRATED = 150**

## 3. Public pages / surfaces

Covered via `apex-shell` / `tenant-public-shell` CSS:

- Apex home, about, pricing, register/auth chrome on apex
- Tenant church home, about, leadership, ministries, events, sermons, giving, contact
- Public navigation / footer / cards / CTAs / forms chrome
- Optional Contemporary Fellowship theme pack

Shells set `data-product="blessboard"` and load `head-platform-colors` → `design-tokens.css` before shell CSS.

## 4. Semantic tokens used

`--color-background|surface|surface-subtle|text-*|border-*|brand-*|success*|warning*|danger*|info*|focus*|link*|modal-overlay` plus BB aliases `--bb-color-*` / `--bb-violet` / `--bb-ink|bg|surface|muted|border`.

Shadows use `--bb-shadow-sm|md|lg|focus` (tokenized via `color-mix`).

## 5. BB brand decisions

| Alias | Resolves to |
| --- | --- |
| `--bb-color-primary*` | `--color-brand-primary*` (violet via `data-product="blessboard"`) |
| `--bb-color-accent*` | `--color-brand-accent*` |
| `--bb-color-ink/muted/page/surface/border` | platform text/surface/border |
| `--bb-violet` | `--bb-color-primary` (compat; Batch 8 may retire) |
| About-section locals `--bb-about-*` | remapped to `--bb-color-*` / status semantics (no page HEX APIs) |

No `--church-home-purple` / `--sermon-gold` style APIs introduced.

## 6. Tenant-branding decisions

| Mechanism | Treatment |
| --- | --- |
| `tenant-public-shell-start.ejs` `brandStyle` inline runtime | **TENANT_BRANDING** preserved |
| Contemporary Fellowship overrides `--bb-color-*` under `body.gp-website-theme--*` | Theme branding via **var-defs** (not scannable); properties consume vars |
| HEX fallbacks `var(--bb-color-*, #…)` | Removed → `var(--bb-color-*)` (platform BB brand when unset) |

**TENANT_BRANDING_RETAINED (scannable remaining) = 0**  
Runtime / theme overrides remain functional.

## 7. Retained raw colors

None in Batch 7 scannable property usages.

`JUSTIFIED_DECORATIVE = 0` · `MISSED_MIGRATION = 0`

## 8. Before / after counts

| Metric | Value |
| --- | ---: |
| REPO_BEFORE | 321 |
| REPO_AFTER | **171** |
| Migrated | 150 |
| TOTAL_REMOVED_FROM_FOUNDATION | **1120** (`1291 − 171`) |
| COUNT_CONSISTENCY | **PASS** (`321 − 150 = 171`) |

## 9. Intentional visible changes

1. Status / admin-status greens/ambers/reds consolidated onto platform success/warning/danger families.
2. Public HEX fallbacks removed; unset brand uses platform BB violet (`#6C5CE7` via brand tokens).
3. Shadows / overlays use `color-mix` against text/brand tokens.
4. Apex about-section local palette remapped onto brand/status tokens (indigo-adjacent secondary → primary-hover family).

Layout/type/copy unchanged. BB remains violet (not AC teal/blue).

## 10. Accessibility

Focus rings use `--color-focus-ring` / `--bb-shadow-focus`; CTA inverse text via `--color-text-inverse` / `--bb-color-on-primary`; status chips use platform AA-oriented tokens.

`ACCESSIBILITY=PASS` · `NEW_ACCESSIBILITY_RISKS=0`

## 11. Responsive

Existing `@media` structure retained in apex/tenant-public/theme pack. `RESPONSIVE_REGRESSION=PASS`.

## 12–14. Regression

| Check | Result |
| --- | --- |
| BB_PUBLIC_REGRESSION | PASS (shells + token wiring + tests) |
| BB_THEME | PASS (violet via `data-product="blessboard"`) |
| AC_REGRESSION_GUARD | PASS (no AC public CSS modified) |
| PUBLIC_SEMANTIC_PARITY | PASS (shared semantic contracts; distinct brand resolution) |
| VISUAL_PARITY | PASS (semantic consolidation only) |

## 15. Token health

`UNDEFINED_TOKENS=0` · `CIRCULAR_REFERENCES=0` · `MAX_ALIAS_CHAIN_AFTER=4` · `COMPATIBILITY_ALIASES=17`  
`NEW_COMPONENT_TOKENS=0` · `NEW_DOMAIN_TOKENS=0`  
(Added `--bb-shadow-lg` local shadow alias in design-tokens — non-color-primitive metric.)

## 16. Final residue classification

| Scope | Count | Notes |
| --- | ---: | --- |
| BATCH_8_CLEANUP | **146** | `public/styles.css` (61), admin CRM/field-agent views, misc EJS/JS, write-maintenance, branding preview JS |
| OUT_OF_SCOPE_OR_JUSTIFIED | **25** | Marketing/feature SVGs, AC illustration SVGs, favicon |
| **Sum** | **171** | |

### OUT_OF_SCOPE subclasses

| Class | Count |
| --- | ---: |
| CONTENT_COLOR | 23 |
| BRAND_ASSET | 2 |
| TENANT_BRANDING | 0 |
| DATA_VISUALIZATION | 0 |
| NON_UI | 0 |
| OTHER_JUSTIFIED | 0 |

`REMAINING_SCOPE_RECONCILIATION=PASS` (`146 + 25 = 171`)

Prior Batch 6 estimate was 149/22; rescan after Batch 7 reclassified illustration SVGs into OUT (CONTENT_COLOR) and adjusted cleanup accordingly.

## 17. Worktree integrity

- Branch V4  
- No temporary scanner stash used  
- Diff limited to Batch 7 CSS/shells/tokens + docs/tests  
- `WORKTREE_INTEGRITY=PASS`

## 18. Tests

- `tests/v2-04-color-migration-batch-7.test.js`  
- Full V2.04 color suite (batches 1–7 + resolution + platform theme): **48 pass**

## 19. Risks / debt

1. Compatibility aliases (`--bb-violet`, etc.) retained for Batch 8 cleanup.  
2. Contemporary Fellowship still invents local `--bb-theme-*` var-defs (theme pack pattern; property usages tokenized).  
3. `public/styles.css` + field-agent/admin residual remain Batch 8.  
4. Apex about locals (`--bb-about-*`) retained as section aliases but now resolve through brand/status tokens.
