# V2.04 Color Migration — Batch 5

**Status:** COMPLETE  
**Branch:** V4  
**Base hardening commit:** `5c5710f0818abb8d0b6e1766b9ff5ce4c0dda2f8`  
**Theme source:** `src/platform/ui/theme/colors.css`  
**Date:** 2026-09-29  

## 1. Scope

Migrate **website editor GUI chrome** shared by BlessBoard and ActiveClinic to V2.04 semantic / component tokens.

**In scope:** editor toolbars, pencils, selection/hover outlines, dialogs, publish/draft/preview chrome, media-field UI, theme gallery chrome, history/scope/styles hubs, add-section picker, version-preview banner, admin website content-report chrome.

**Out of scope:** tenant website presentation (Batches 6–7), uploaded media, CMS content colors, branding color-picker placeholders.

## 2. Exact files

| File | Role | Before | After |
| --- | --- | ---: | ---: |
| `public/platform/website-inline-edit.css` | Shared inline editor chrome | 36 | 0 |
| `public/platform/website-change-manager-ui.css` | Publish / change-manager UI | 32 | 0 |
| `public/platform/website-theme-gallery.css` | Theme gallery chrome | 25 | 0 |
| `public/platform/website-history.css` | Version history UI | 16 | 0 |
| `public/platform/website-scope-list.css` | Website scope list | 16 | 0 |
| `public/platform/website-media-field.css` | Media field / library chrome | 10 | 0 |
| `public/platform/website-styles.css` | Styles hub chrome | 10 | 0 |
| `public/platform/website-add-section.css` | Add-section picker | 9 | 0 |
| `public/platform/website-version-preview.css` | Preview banner | 4 | 0 |
| `views/admin/website_content_report.ejs` | Admin report chrome | 8 | 0 |
| `views/activeclinic/app/website-cms-branding.ejs` | Tenant brand pickers | 2 | 2 (retained) |
| `views/blessboard/v5/hq/website-branding.ejs` | Tenant brand defaults | 2 | 2 (retained) |

**BATCH5_FILES = 12**  
**BATCH5_RAW_COLORS_BEFORE = 170**  
**BATCH5_RAW_COLORS_AFTER = 4**  
**BATCH5_LOCATIONS_MIGRATED = 166**

Also updated: `src/platform/ui/theme/colors.css` (+ mirror), shell CSS cache busts, docs/tests.

## 3. BlessBoard editor surfaces

Covered via shared platform CSS loaded from:

- Tenant public shell (inline edit, change manager, add section)
- HQ / branch admin shells (inline edit, media field)
- HQ website branding page (content placeholders retained)
- Platform website history / theme gallery / scope / styles pages

## 4. ActiveClinic editor surfaces

Covered via shared platform CSS loaded from:

- Public shell (inline edit, change manager, add section)
- App shell (media field)
- Website CMS branding (content placeholders retained)
- Staff `website-cms.css` already migrated in Batch 3

## 5. Editor component tokens (new)

Added to `colors.css` (18):

`--editor-toolbar-bg|border|text`, `--editor-control-bg|text|border|hover-bg`, `--editor-selection-border`, `--editor-hover-border`, `--editor-edit-control-bg|text`, `--editor-canvas-bg`, `--editor-rail-bg`, `--editor-overlay-bg`, `--editor-muted-text`, `--editor-outline`, `--editor-preview-banner-bg|text`

All map to existing platform semantic / brand / modal tokens.

**NEW_EDITOR_COMPONENT_TOKENS = 18**  
**NEW_EDITOR_DOMAIN_TOKENS = 0**

Compatibility aliases in editor CSS (`--gp-we-*`, `--gp-cm-*`) now resolve to editor/platform tokens (not raw HEX).

## 6. Workflow-state semantic decisions

| State | Mapping |
| --- | --- |
| Draft / pending | `--color-warning*` / `--gp-cm-tertiary-*` → warning |
| Published / saved / success | `--color-success*` / `--badge-success-*` |
| Error / remove / destructive | `--color-danger*` / `--button-danger-*` |
| Info / type chips | `--color-info*` |
| Preview banner | `--editor-preview-banner-*` |
| Saving / publishing busy | muted / brand primary (existing control styles) |

## 7. Editor chrome vs tenant content

| Class | Treatment |
| --- | --- |
| Editor chrome HEX/RGB | Migrated to tokens |
| Tenant branding defaults / color inputs (`#6c5ce7`, `#006068`, …) | **TENANT_CONTENT_COLOR** — retained |
| Theme card swatches (`--theme-swatch-*`) | **INTENTIONALLY_OPTIONAL** runtime vars with semantic fallbacks |
| Website presentation / public CSS | Deferred Batches 6–7 |

## 8. Before / after counts

| Metric | Value |
| --- | ---: |
| BATCH5_RAW_COLORS_BEFORE | 170 |
| BATCH5_RAW_COLORS_AFTER | 4 |
| BATCH5_LOCATIONS_MIGRATED | 166 |
| BATCH5_REMAINING_RAW_COLORS | 4 |
| MISSED_MIGRATION | 0 |
| REPO_HARDCODED_COLORS_BEFORE | 592 |
| REPO_HARDCODED_COLORS_AFTER | **426** |
| TOTAL_REMOVED_FROM_FOUNDATION | **865** (`1291 − 426`) |
| COUNT_CONSISTENCY | **PASS** (`592 − 166 = 426`) |

## 9. Retained raw colors

| File | Count | Classification |
| --- | ---: | --- |
| `website-cms-branding.ejs` | 2 | TENANT_CONTENT_COLOR |
| `website-branding.ejs` | 2 | TENANT_CONTENT_COLOR |

## 10. Intentional visible changes

1. **Product brand on shared editor chrome** — Hard-coded BlessBoard violet / change-manager teal replaced with `--color-brand-primary`, so ActiveClinic editors resolve teal/blue via `data-product` / surface (correct dual-brand behavior).
2. **Status chips** — Drifted greens/reds/ambers consolidated onto platform success/warning/danger families (accessibility alignment).

No layout/spacing/typography/copy changes.

## 11. Accessibility

- Overlays use `--editor-overlay-bg` / `--modal-overlay`
- Focus / selection use brand focus ring
- Danger/success text use platform AA-oriented chip colors
- Edit controls remain brand-colored (visible on varied tenant canvases)

`ACCESSIBILITY=PASS` · `NEW_ACCESSIBILITY_RISKS=0`

## 12–14. Regression / parity

| Check | Result |
| --- | --- |
| BB_EDITOR_REGRESSION | PASS (token wiring + shells load platform colors + editor CSS) |
| AC_EDITOR_REGRESSION | PASS |
| EDITOR_SEMANTIC_PARITY | PASS (shared `--editor-*` / `--gp-we-*` / `--gp-cm-*` contract; brands differ via `data-product`) |
| BB_THEME / AC_THEME | PASS |
| VISUAL_PARITY | PASS (intentional brand resolution only) |

## 15. Undefined-token verification

Extended `tests/v2-04-color-token-resolution.test.js` to Batch 5.

`UNDEFINED_TOKENS=0` · `CIRCULAR_REFERENCES=0` · `MAX_ALIAS_CHAIN_AFTER=4`

Optional runtime: `--theme-swatch-primary|accent` (allowlisted).

## 16. Alias status

Foundation `COMPATIBILITY_ALIASES=17` unchanged. `--gp-we-*` / `--gp-cm-*` retained as editor-local aliases → platform (candidates for Batch 8 cleanup, not removed).

## 17. Remaining-scope reconciliation

| Scope | Count |
| --- | ---: |
| BATCH_6_AC_PUBLIC | 105 |
| BATCH_7_BB_PUBLIC | 150 |
| BATCH_8_CLEANUP | 149 |
| OUT_OF_SCOPE_OR_JUSTIFIED | 22 (18 prior + 4 branding placeholders) |
| **Sum** | **426** |

`REMAINING_SCOPE_RECONCILIATION=PASS`

## 18. Worktree integrity

Branch `V4`; no scan stash of this work; diff limited to Batch 5 + foundation/docs/tests/shell cache busts.

`WORKTREE_INTEGRITY=PASS`

## 19. Tests

- `tests/v2-04-color-migration-batch-5.test.js`
- `tests/v2-04-color-token-resolution.test.js` (Batch 1–5)
- Batches 1–4 + platform theme suites

`TESTS=PASS`

## 20. Risks / debt

- Branding EJS placeholders remain until a product decision to reference CSS variables in defaults (still TENANT_CONTENT).
- `--gp-we-*` / `--gp-cm-*` alias layer can shrink in Batch 8 once consumers call `--editor-*` / `--color-*` directly.
- Public website presentation (apex/tenant/AC public) intentionally untouched.
