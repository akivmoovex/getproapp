# V2.04 Color System — Final Freeze

**Status:** FROZEN  
**Branch:** V4  
**Freeze commit:** (see Batch 8 commit on `origin/V4`)  
**Canonical theme:** `src/platform/ui/theme/colors.css`  
**Runtime mirror:** `public/platform/theme/colors.css`  
**Date:** 2026-09-29  

## 1. Architecture

```
PLATFORM PRIMITIVES (--palette-*)
        ↓
PLATFORM SEMANTIC TOKENS (--color-*)
        ↓
PRODUCT BRAND (--color-brand-* via data-product / data-surface)
        ↓
COMPONENT TOKENS (--button-*, --input-*, --card-*, --nav-*, …)
        ↓
PRODUCT BRIDGES (optional --bb-*, --acp-*, --ac-* aliases)
        ↓
APPLICATION UI
```

Products share **semantic contracts**. They do **not** share brand primaries.

## 2. Token hierarchy (final inventory)

| Layer | Count | Notes |
| --- | ---: | --- |
| PRIMITIVE_TOKENS | **44** | `--palette-*` |
| PLATFORM_SEMANTIC_TOKENS | **35** | `--color-*` non-brand |
| BRAND_TOKENS | **7** | `--color-brand-*` names |
| COMPONENT_TOKENS | **57** | button/input/card/nav/table/modal/badge |
| EDITOR_COMPONENT_TOKENS | **18** | `--editor-*` |
| AC_DOMAIN_TOKENS | **5** | appointment/encounter/preview |
| BB_DOMAIN_TOKENS | **0** | unused publish/draft/inactive aliases removed |
| COMPATIBILITY_ALIASES (foundation) | **0** | `--product-*` / `--gp-ops-*` removed from `colors.css` |

`UNUSED_TOKENS`: none material in foundation after cleanup.  
`DEPRECATED_TOKENS`: 0 retained in foundation.  
Product bridges may still carry short `--bb-ink` / `--product-*` aliases for consumers — not counted in the foundation 17.

## 3. Product theming model

| Product | Activator | Brand personality |
| --- | --- | --- |
| BlessBoard | `data-product="blessboard"` | Violet `#6C5CE7`, warm page tint |
| ActiveClinic public | `data-product="activeclinic"` (+ `data-surface="public"`) | Teal `#006068` |
| ActiveClinic staff | `data-surface="staff"` / `body.ac-app-body` | Blue `#2563EB` |

Tenant branding overrides (church/clinic accent) remain runtime-owned via inline/`brandStyle`/CMS color inputs.

## 4. Migration history

| Checkpoint | Hard-coded file×color |
| --- | ---: |
| Foundation | 1291 |
| Batch 1 | 1223 |
| Batch 2 | 1152 |
| Batch 3 | 1055 |
| Batch 4 | 592 |
| Correction gate | 592 |
| Batch 5 | 426 |
| Batch 6 | 321 |
| Batch 7 | 171 |
| **Batch 8 (final)** | **41** |

**TOTAL_LOCATIONS_REMOVED_FROM_FOUNDATION = 1250**  
**FINAL_MIGRATION_PERCENT = 96.8%**

## 5. Final raw-color posture

`UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS=0`

Remaining **41** locations are exclusively:

| Category | Approx count |
| --- | ---: |
| CONTENT_COLOR | 23 |
| BRAND_ASSET | 2 |
| PRINT_EXPORT_COMPATIBILITY | 8 |
| TENANT_BRANDING | 8 |

Register + allowlist: `docs/qa/V2_04_COLOR_MIGRATION_BATCH_8.md`, `tests/v2-04-color-migration-batch-8.test.js`.

## 6. Compatibility aliases

| Metric | Value |
| --- | ---: |
| BEFORE (foundation) | 17 |
| REMOVED | 17 |
| AFTER (foundation) | 0 |
| MAX_ALIAS_CHAIN_AFTER | ≤2 (foundation) |

Appearance names `--bb-violet` / `--ac-teal` removed after consumer migration.

## 7. Domain tokens

- AC: keep appointment/encounter/preview domain aliases (genuine clinical/website meaning).  
- BB: removed unused publish/draft/inactive domain aliases (prefer `--badge-*`).

`SEMANTIC_DUPLICATION_GROUPS=0` · `INVALID_APPEARANCE_NAMED_TOKENS=0`

## 8. Accessibility

`ACCESSIBILITY=PASS` · `NEW_ACCESSIBILITY_RISKS=0`  
Status/text/focus use platform AA-oriented semantic tokens.

## 9. Regression

| Gate | Result |
| --- | --- |
| BB_FULL_REGRESSION | PASS |
| AC_FULL_REGRESSION | PASS |
| CROSS_PRODUCT_SEMANTIC_PARITY | PASS |
| RESPONSIVE_REGRESSION | PASS |
| BB_VISUAL_PARITY | PASS |
| AC_VISUAL_PARITY | PASS |

## 10. Automated guards

1. **Raw color guard** — `tests/v2-04-color-migration-batch-8.test.js`  
2. **Token resolution** — `tests/v2-04-color-token-resolution.test.js`  
3. **Mirror identity** — platform theme tests require `src` ≡ `public` colors.css  

## 11. Rules for future development

1. New platform-owned GUI must not introduce raw HEX/RGB/HSL when a semantic/component token exists.  
2. Choose tokens by **semantic purpose**, not HEX similarity.  
3. Shared BB/AC components use platform/component semantics.  
4. Product identity resolves through `--color-brand-*` / `data-product`.  
5. Tenant/content colors remain tenant/content owned.  
6. New domain tokens require stable semantic meaning.  
7. Appearance-based application token names are prohibited.  
8. Undefined color tokens are a test failure.  
9. New raw-color exceptions require an allowlist entry + rationale in Batch 8 guard.

## 12. Known justified exceptions

See Batch 8 retained register (print ink, color-picker HEX, marketing SVG artwork, favicon).

## 13. Production

V4 only. **Do not** treat this freeze as authorization to merge to V10 or deploy. Production remains untouched by this workstream.
