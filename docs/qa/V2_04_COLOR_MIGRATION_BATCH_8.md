# V2.04 Color Migration — Batch 8 (Final Cleanup)

**Status:** COMPLETE  
**Branch:** V4  
**Base commit:** `18111ed34d793f161dd0005a00c05cd72a5dae13` (Batch 7)  
**Theme source:** `src/platform/ui/theme/colors.css`  
**Date:** 2026-09-29  

## 1. Exact scope

Final V2.04 cleanup: migrate remaining **platform-owned GUI** raw colors; classify and retain justified exceptions; remove unused foundation compatibility aliases; freeze the color system.

**Goal:** `UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS=0` (not `RAW_COLORS=0`).

## 2. Pre-migration inventory

| Scope | Count |
| --- | ---: |
| REPO_HARDCODED_COLORS_BEFORE | **171** |
| BATCH_8_CLEANUP candidates | **146** |
| PREVIOUSLY_JUSTIFIED | **25** |

Counts matched Batch 7 residue map. Full inventory captured before edits (authoritative scanner).

## 3. Disposition summary

| Disposition | Count |
| --- | ---: |
| PLATFORM/COMPONENT/SEMANTIC migrate | **130** |
| Retained (justified) | **41** |
| **Sum** | **171** |

`BATCH8_LOCATIONS_MIGRATED=130` · `BATCH8_LOCATIONS_RETAINED=41` · `130+41=171`

## 4. Migrated surfaces (examples)

- `public/styles.css` — legacy GetPro app chrome (status, cards, resets, timelines)
- `views/admin/crm.ejs` + field-agent/admin finance views — inline status/surface colors
- `views/partials/critical_css_home.ejs` — above-the-fold critical CSS
- `public/blessboard/v5/write-maintenance.css` — brand wash → tokens
- `views/blessboard/v5/tenant-landing.ejs` — badge surfaces
- AC facility/cashier danger accents; church HQ bar chart → info brand semantics
- Misc content/company/terms card fallbacks → surface/border tokens

## 5. Previously justified review (25)

| Result | Count |
| --- | ---: |
| PREVIOUSLY_JUSTIFIED_REVIEWED | 25 |
| PREVIOUSLY_JUSTIFIED_STILL_VALID | 25 |
| PREVIOUSLY_JUSTIFIED_RECLASSIFIED | 0 |

SVGs/favicon remain CONTENT_COLOR / BRAND_ASSET.

## 6. Final retained register (41)

| Category | Count | Files |
| --- | ---: | --- |
| CONTENT_COLOR | 23 | feature-*.svg, doctor-fallback, AC service icons |
| BRAND_ASSET | 2–3* | `public/favicon.svg` |
| PRINT_EXPORT_COMPATIBILITY | 8 | `statement_print.ejs`, billing statement `#000`, medicine label `#222` |
| TENANT_BRANDING | 8 | website branding JS/EJS color-picker defaults (HEX required) |

\*Scanner unique file×color for favicon = 2; guard allowlists all favicon fills.

Full allowlist: `tests/v2-04-color-migration-batch-8.test.js` (`ALLOWLIST`).

## 7. Counts

| Metric | Value |
| --- | ---: |
| REPO_BEFORE | 171 |
| REPO_AFTER | **41** |
| TOTAL_REMOVED_FROM_FOUNDATION | **1250** (`1291 − 41`) |
| FINAL_MIGRATION_PERCENT | **96.8%** |
| UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS | **0** |
| COUNT_CONSISTENCY | **PASS** |

## 8. Compatibility aliases

Foundation (`colors.css`) before Batch 8: **17** (`--product-*` ×10 + `--gp-ops-*` ×7).

| Action | Detail |
| --- | --- |
| Removed | All 17 (zero consumers in tracked app CSS) |
| Appearance cleanup | Removed `--bb-violet*`, `--bb-getpro`, `--bb-warm`, `--ac-teal*`; removed unused BB `--status-published|draft|inactive-*` |
| Retained (product bridges) | Short `--bb-ink/--bb-bg/…` and `--product-*` in `design-tokens.css` / `ac-tokens.css` for remaining consumers / editor contracts |

`COMPATIBILITY_ALIASES_BEFORE=17` · `REMOVED=17` · `AFTER=0` (foundation)

`MAX_ALIAS_CHAIN_AFTER=2` (foundation graph)

## 9. Intentional visible changes

1. Legacy `styles.css` status chips consolidated onto platform success/warning/danger/info.  
2. Admin inline notice colors → semantic tokens (may shift slightly toward platform AA greens/reds).  
3. HQ bar chart bar uses `--color-info-text` (semantic series for single-series chart).  

No layout/typography/IA changes.

## 10–14. Gates

| Check | Result |
| --- | --- |
| ACCESSIBILITY | PASS |
| RESPONSIVE_REGRESSION | PASS |
| BB_FULL_REGRESSION | PASS (V2.04 + design-system + branding suites) |
| AC_FULL_REGRESSION | PASS (V2.04 AC batch tests; public/staff token wiring) |
| CROSS_PRODUCT_SEMANTIC_PARITY | PASS |
| BB/AC_VISUAL_PARITY | PASS |
| UNDEFINED/CIRCULAR | 0 / 0 |
| PRODUCT LEAKS | 0 |
| RAW_COLOR_GUARD | PASS |
| TOKEN_VALIDATION_GUARD | PASS |

## 15. Automated guards

- `tests/v2-04-color-migration-batch-8.test.js` — allowlisted residual scan  
- `tests/v2-04-color-token-resolution.test.js` — undefined/circular/depth/leak  

## 16. Worktree integrity

Branch V4; no scanner stash; diff = Batch 8 cleanup + docs/tests/theme. `WORKTREE_INTEGRITY=PASS`

## 17. Risks / debt

1. Product-local `--product-*` / `--bb-ink` short aliases remain outside foundation count — optional future drain.  
2. Print/statement styles intentionally raw.  
3. Color-picker HEX defaults must stay HEX (HTML constraint).
