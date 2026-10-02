# V2.04 Color Token Migration Plan

**Branch:** V4  
**Base:** V10 (`05b2afe1caffaee8238cb0d4b3a6fb2f8f8a43d7` at foundation start)  
**Audit:** `docs/qa/V2_04_GUI_COLOR_THEME_AUDIT.md`  
**Foundation:** `src/platform/ui/theme/colors.css`  

## Authoritative comparable migration baseline

Use the **same git-tracked scanner** as Batches 1–2 for all subsequent batches:

| Checkpoint | Hard-coded file×color locations |
| --- | --- |
| Theme foundation (comparable) | **1291** |
| After Batch 1 | **1223** |
| After Batch 2 | **1152** |
| After Batch 3 | **1055** |
| After Batch 4 | **592** |
| Correction gate | **592** |
| After Batch 5 | **426** |
| After Batch 6 | **321** |
| After Batch 7 | **171** |
| After Batch 8 (final freeze) | **41** |

Historical audit value **1123** is **NON-COMPARABLE** (different scanner/tree boundary). Keep it only as historical context — do not use it as the migration baseline.

## Goals

- Migrate hard-coded colors to platform semantic / component tokens in controlled batches.
- Preserve distinct BlessBoard and ActiveClinic brand colors.
- Preserve ActiveClinic dual surface (public teal vs staff blue).
- Avoid repository-wide find/replace.

## Inventory reminder (audit — historical)

| Metric | Count |
| --- | --- |
| BB unique colors | 398 |
| AC unique colors | 208 |
| Shared/platform unique | 230 |
| Hard-coded file×color locations (historical audit) | 1123 (NON-COMPARABLE) |
| Semantic drift groups | 16 |

---

## BATCH 1 — Shared platform components

| Field | Detail |
| --- | --- |
| Affected files | `public/platform/gp-ops-shared.css`, `gp-auth-reg.css`, `forms-builder.css`, `announcements.css`, `phone-field.css`, `website-*.css` (shared chrome only), `public/design-system.css` (aliases only if safe) |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_1.md` |
| Measured locations migrated | 68 (1291 → 1223) |
| Risk | MEDIUM — shared by BB+AC; regressions affect both products |
| Visual QA | Auth chrome, ops cards/tables, forms studio, announcements, website editor chrome on both products |
| BB/AC regression | Smoke login + one ops list + one form builder page per product |

**Exit criteria:** Shared components consume `--button-*` / `--color-*` / `--nav-*` where practical; no brand homogenization.

---

## BATCH 2 — Authentication + registration

| Field | Detail |
| --- | --- |
| Affected files | `public/platform/gp-auth-reg.css`, `registration-ux.css`, BB `apex-auth.css` / `tenant-auth.css`, AC `ac-auth.css`, related EJS shells |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_2.md` |
| Measured locations migrated | 71 (1223 → 1152) |
| Risk | HIGH — security-critical UX; first impression |
| Visual QA | BB apex login/register; AC auth login/register; identifier tabs; error/success flashes |
| BB/AC regression | Full auth path smoke both products (desktop + mobile) |

---

## BATCH 3 — ActiveClinic staff application

| Field | Detail |
| --- | --- |
| Affected files | `public/activeclinic/ac-app.css`, `ac-app-tokens.css` (alias bridge), `ac-urp.css`, `website-cms.css` (staff CMS) |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_3.md` |
| Measured locations migrated | 97 (1152 → 1055) |
| Risk | HIGH — daily clinical ops UI |
| Visual QA | Shell, dashboard, patients list, appointments, billing entry points; confirm **blue** staff brand retained |
| BB/AC regression | AC staff only for this batch; BB smoke still green |

**Note:** Eliminate leftover `#0F172A` / `#64748B` / `#E2E8F0` drift toward ODS neutrals.

---

## BATCH 4 — BlessBoard management / member application

| Field | Detail |
| --- | --- |
| Affected files | `platform-admin.css`, `hq-admin.css`, `branch-admin.css`, `member-portal.css`, `media-picker.css`, `bb-urp.css`, legacy `church.css` alias bridge, `design-tokens.css` bridge |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_4.md` |
| Measured locations migrated | 463 (1055 → 592) |
| Risk | HIGH — volume + dual BB token systems (`design-tokens` vs `church.css`) |
| Visual QA | HQ, branch admin, member portal, platform admin; warm violet brand retained |
| BB/AC regression | BB admin/member; AC smoke |

**Note:** Prefer aliasing `--church-*` → platform/BB brand tokens before deleting literals.

---

## BATCH 5 — Website editors

| Field | Detail |
| --- | --- |
| Affected files | `website-inline-edit.css`, `website-change-manager-ui.css`, `website-history.css`, `website-add-section.css`, `website-media-field.css`, `website-theme-gallery.css`, `website-scope-list.css`, `website-styles.css`, `website-version-preview.css`, admin content-report chrome |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_5.md` |
| Measured locations migrated | 166 (592 → 426); 4 tenant branding placeholders retained |
| Risk | MEDIUM — editor chrome; must respect `data-product` brand |
| Visual QA | BB + AC website edit mode, dialogs, history, media field |
| BB/AC regression | Editor open/save chrome both products |

---

## BATCH 6 — ActiveClinic public website

| Field | Detail |
| --- | --- |
| Affected files | `ac-public.css`, `acw-platform.css`, `ac-patient.css`, `website-theme-family-wellness-mint.css`, patient print/JS chrome |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_6.md` |
| Measured locations migrated | 105 (426 → 321) |
| Risk | MEDIUM–HIGH — marketing + booking + portal |
| Visual QA | Platform home, tenant mini-site, patient portal; **teal** brand retained via `data-surface="public"` |
| BB/AC regression | AC public/patient; BB smoke |

---

## BATCH 7 — BlessBoard public website

| Field | Detail |
| --- | --- |
| Affected files | `apex.css`, `tenant-public.css`, `website-theme-contemporary-fellowship.css`, `design-tokens.css` (`--bb-shadow-lg`) |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_7.md` |
| Measured locations migrated | 150 (321 → 171) |
| Risk | MEDIUM–HIGH — apex marketing + tenant public |
| Visual QA | Apex home/pricing/about; tenant public home; **violet** brand retained via `data-product="blessboard"` |
| BB/AC regression | BB public; AC smoke |

---

## BATCH 8 — Remaining hard-coded colors + cleanup

| Field | Detail |
| --- | --- |
| Status | **COMPLETE** — see `docs/qa/V2_04_COLOR_MIGRATION_BATCH_8.md` + `docs/qa/V2_04_COLOR_SYSTEM_FINAL_FREEZE.md` |
| Measured | Migrated **130** GUI locations; retained **41** justified (171 → 41) |
| Foundation aliases | Removed **17** unused `--product-*` / `--gp-ops-*` |
| Guard | `tests/v2-04-color-migration-batch-8.test.js` allowlist |
| Risk | LOW–MEDIUM |
| Visual QA | Spot-check previously migrated surfaces + residual print/branding |
| BB/AC regression | Full V2.04 color suite + design-system/branding smoke |

---

## Cross-batch rules

1. Alias-first: map legacy variables to new tokens before deleting HEX.
2. One product surface at a time for brand-sensitive work.
3. No production deploy / DB changes as part of color migration.
4. Do not merge V4 into V10 from color work alone.
5. After each batch: automated tests + visual QA checklist above.
6. Keep `src/platform/ui/theme/colors.css` and `public/platform/theme/colors.css` identical.

## Batch count

**MIGRATION_BATCHES=8**
