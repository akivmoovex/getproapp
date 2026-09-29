# V2.04 Color Migration — Batch 1

**Status:** COMPLETE  
**Branch:** V4  
**Foundation commit:** `1f4019b48e6d61a6ac6beed07a591452486d8af9`  
**Theme source:** `src/platform/ui/theme/colors.css`  
**Date:** 2026-09-29  

## Scope

Migrate **shared platform components** (Batch 1 of 8) from hard-coded GUI colors to V2.04 semantic / component tokens.

### Included (9 files)

| File | Role |
| --- | --- |
| `public/platform/gp-ops-shared.css` | Shared ops buttons, inputs, cards, tables, badges, tabs, pagination, timeline |
| `public/platform/gp-auth-reg.css` | Shared auth/registration chrome tokens + product theme bridges |
| `public/platform/forms-builder.css` | Shared Form Studio UI |
| `public/platform/announcements.css` | Shared announcements UI |
| `public/platform/phone-field.css` | Shared PhoneField control |
| `public/platform/location-autocomplete.css` | Shared location listbox |
| `public/platform/release-notes-center.css` | Platform release-notes hub chrome |
| `public/m3-modal.css` | Already tokenized — verified clean |
| `public/design-system.css` | Already tokenized — verified clean |

### Explicitly excluded (later batches)

- Website editor CSS (`website-*.css`) → Batch 5  
- `registration-ux.css` + product auth page skins → Batch 2  
- AC staff / BB admin / public marketing product CSS → Batches 3–7  

## Components migrated

- Buttons (primary / secondary) + hover / active / focus-visible / disabled  
- Inputs + hover / focus / disabled / placeholder  
- Cards, empty states  
- Tables + header / row hover  
- Navigation-like status tabs + pagination  
- Badges / status (success, warning, danger, info, neutral)  
- Auth identifier tabs, registration cards/stepper chrome (shared)  
- Forms / announcements badges, alerts, panels  
- Phone field + location autocomplete listbox  
- Release notes buttons, tables, tabs, pills  

## Tokens used (representative)

| Role | Token |
| --- | --- |
| Primary button | `--button-primary-bg`, `-hover`, `-active`, `-text`, `-border` |
| Secondary button | `--button-secondary-*` |
| Inputs | `--input-*` |
| Cards | `--card-*` |
| Nav / tabs | `--nav-*` |
| Tables | `--table-*` |
| Badges / alerts | `--badge-*`, `--color-danger-*`, `--color-warning-*`, `--color-success-*` |
| Brand inheritance | `--color-brand-primary*` (via `data-product` / `data-gp-product`) |
| Focus | `--color-focus`, `--color-focus-ring`, `--input-focus-ring` |
| Overlays / elevation | `--modal-overlay`, `color-mix(... var(--color-text-primary) …)` |

Product identity is preserved: shared components do **not** hardcode BB violet or AC teal/blue. Brand resolves through `--color-brand-*`.

## Metrics

| Metric | Value |
| --- | --- |
| BATCH1_FILES | 9 |
| BATCH1_RAW_COLORS_BEFORE | 68 unique file×color locations (146 literal occurrences) |
| BATCH1_RAW_COLORS_AFTER | 0 |
| BATCH1_LOCATIONS_MIGRATED | 68 |
| BATCH1_REMAINING_JUSTIFIED_RAW_COLORS | 0 |

### Remaining raw colors in Batch 1 files

**None.** Post-migration scan found zero HEX / `rgb()` / `rgba()` / `hsl()` literals in the nine Batch 1 files (including comments). Elevation uses `color-mix(..., transparent)` against semantic tokens — not raw RGB.

## Repository hard-coded color count

| Measure | Count |
| --- | --- |
| Audit baseline (`HARDCODED_COLOR_LOCATIONS`) | **1123** |
| Comparable remeasure (git-tracked `public`/`views`/`frontend`, same non-token / non-var-def rules) **pre-Batch1** | 1291 |
| Comparable remeasure **post-Batch1** | **1223** |
| Verified Batch 1 delta | **−68** |

Notes:

- The original audit figure (1123) remains the published baseline.  
- Re-running the same rules on the current git-tracked tree yields a higher absolute base (1291) due to tree/methodology boundary differences vs the original filesystem pass (e.g. local untracked `* 2.*` duplicates must be excluded; foundation file set differs slightly).  
- Batch 1’s contribution is measured consistently: **68 locations removed**, matching the Batch 1 before/after inventory.  
- Do not interpret 1223 vs 1123 as a Batch 1 regression; the comparable delta is −68.

**Reported fields for the gate:**

- `REPO_HARDCODED_COLORS_BEFORE=1123`  
- `REPO_HARDCODED_COLORS_AFTER=1223` (comparable tracked scan after Batch 1)

## Visual parity

Architectural migration only — no intentional redesign.

| Surface | Observation |
| --- | --- |
| Ops primitives | Still resolve to product brand primary via `--color-brand-*` / staff blue when `data-surface="staff"` |
| Auth/reg chrome | Product themes now map exclusively through brand tokens (no HEX fallbacks) |
| Forms / announcements | Accent soft/light from `--color-brand-primary-light`; status badges use shared semantic badge tokens |
| Phone / location | Focus and selection use brand focus / primary-light |

Canonical status colors from the foundation (stronger success/danger text) apply where badges/alerts were migrated — intentional drift resolution from the audit.

## Accessibility

Foundation risks remain mitigated at token layer:

1. Accent orange not used for small text in Batch 1 files  
2. Disabled text uses `--color-disabled-text` (`#6B7280` family)  
3. Muted text uses `--color-text-muted` (not failing subtle grey)  
4. Success/danger badge text uses `--badge-*-text` / `--color-*-text` (stronger shared semantic)  
5. Focus indicators use `--color-focus` / `--color-focus-ring`

Batch 1 interactive migrations include focus-visible / disabled where applicable on ops buttons, inputs, tabs, and phone controls.

**ACCESSIBILITY=PASS** (no reintroduction of the five resolved foundation risks in Batch 1 files).

## Regression

| Check | Result |
| --- | --- |
| Theme loading (`head-platform-colors`) | PASS |
| BB product selector | PASS (`data-product="blessboard"` + auth `data-gp-product`) |
| AC product selector | PASS (`data-product="activeclinic"` + surface staff/public) |
| Undefined tokens in Batch 1 | 0 (all references exist in `colors.css`) |
| `tests/v2-04-platform-color-theme.test.js` | PASS |
| `tests/v2-04-color-migration-batch-1.test.js` | PASS |
| `tests/v2-01-shared-theme-infra.test.js` | PASS |
| DB / production / V10 | UNTOUCHED |

BB/AC theme regression: **PASS** (token wiring + selectors verified by automated tests; no product-specific page CSS changed).

## Remaining risks

1. Shared CSS now depends on `colors.css` loading before these stylesheets — already wired in BB/AC shells; any stray page that loads Batch 1 CSS without the platform color partial would lose brand/semantic resolution.  
2. `gp-auth-reg.css` still has large structural CSS; Batch 2 will continue auth/registration UX polish and product auth skins.  
3. Website editor shared chrome remains hard-coded until Batch 5.  
4. Absolute repo hard-coded count remains high (~1223 comparable) — expected until later batches.

## Production / branches

- Branch: **V4** only  
- **V10** not modified  
- No deploy  
- No database changes  
