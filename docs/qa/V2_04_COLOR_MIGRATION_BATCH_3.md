# V2.04 Color Migration — Batch 3

**Status:** COMPLETE  
**Branch:** V4  
**Foundation commit:** `1f4019b48e6d61a6ac6beed07a591452486d8af9`  
**Batch 1 commit:** `b414689ebfdc3d2b3b97b568f533302c020576eb`  
**Batch 2 commit:** `6c3b8fb6f91960a2513fa74c7cb1e8c76267da67`  
**Theme source:** `src/platform/ui/theme/colors.css`  
**Date:** 2026-09-29  

## Authoritative comparable migration baseline

| Checkpoint | Hard-coded file×color locations |
| --- | --- |
| Theme foundation (comparable) | **1291** |
| After Batch 1 | **1223** |
| After Batch 2 | **1152** |
| After Batch 3 | **1055** |

Scanner methodology: identical to Batches 1–2 (git-tracked `public`/`views`/`frontend`, token-hint exclusions, skip var-def + comment-only lines, unique `(file, normalized HEX)` with RGB→HEX). **Read-only** — no stash/reset/worktree mutation.

Historical audit **1123** remains **NON-COMPARABLE**.

---

## 1. Exact scope

Migrate **ActiveClinic authenticated staff application** colors to V2.04 semantic / component tokens.

### Included (4 files)

| File | Role |
| --- | --- |
| `public/activeclinic/ac-app.css` | Staff shell, dashboard, clinical/ops chrome |
| `public/activeclinic/ac-app-tokens.css` | Staff alias bridge → platform tokens |
| `public/activeclinic/ac-urp.css` | Access / users / roles / permissions |
| `public/activeclinic/website-cms.css` | Staff website CMS (authenticated) |

### Explicitly excluded

| File / area | Reason |
| --- | --- |
| `ac-public.css`, `acw-platform.css` | Batch 6 — public website |
| `ac-patient.css` | Patient portal (not Batch 3 plan) |
| `ac-auth.css` | Batch 2 |
| BlessBoard product CSS | Batch 4+ |
| Platform website editor shared chrome | Batch 5 |

**BATCH3_FILES = 4** (3 scannable for comparable counts; `ac-app-tokens.css` is token-hint excluded)

---

## 2. Files migrated

Same as §1.

---

## 3. ActiveClinic modules covered

Dashboard, patients, appointments, clinical encounter statuses, pharmacy/billing chrome via shared `ac-app` primitives, diagnostics list chrome, access (URP), facilities/settings chrome, staff website CMS.

Staff brand remains **blue** via `[data-product="activeclinic"][data-surface="staff"]`.

---

## 4. Tokens adopted

| Role | Token(s) |
| --- | --- |
| Brand / CTA | `--color-brand-primary*`, `--button-primary-*`, `--button-danger-*` |
| Surfaces | `--color-background`, `--color-surface`, `--color-surface-subtle` |
| Text | `--color-text-primary/secondary/muted/inverse` |
| Borders | `--color-border-default/subtle/strong` |
| Status | `--color-success-*`, `--color-warning-*`, `--color-danger-*`, `--color-info-*` |
| Focus / links | `--color-focus`, `--color-focus-ring`, `--color-link` |
| Compatibility | `--ac-*` aliases in `ac-app-tokens.css` → platform tokens |
| Shadows / overlays | `color-mix(... var(--color-text-primary|/brand-*) …)` |

---

## 5. Domain semantic decisions

| UI state | Mapping | Rationale |
| --- | --- | --- |
| requested | `--status-appointment-requested` → warning text | Pending intake — not danger |
| waiting / arrived | `--status-appointment-waiting` → brand primary | In-queue operational cue |
| with_practitioner | `--status-encounter-with-practitioner` (`#7c3aed`) | Distinct clinical cue; generic tokens would lose recognition |
| confirmed / success badges | success semantic tokens | Completed / healthy path |
| cancelled / no_show / danger | danger semantic tokens | Terminal / error path |
| URP active / pending / danger chips | success / warning / danger | Access lifecycle states |
| Website CMS draft / live / missing | warning / accent-teal mix / danger | Publishing hygiene |
| Brand preview bar | `--ac-website-preview-*` (public teal palette) | Must stay teal while staff shell is blue; JS may override with tenant brand |

---

## 6. New domain tokens

| Token | Definition |
| --- | --- |
| `--status-appointment-requested` | `var(--color-warning-text)` |
| `--status-appointment-waiting` | `var(--color-brand-primary)` |
| `--status-encounter-with-practitioner` | `#7c3aed` (alias-bridge literal only) |
| `--ac-website-preview-primary` | `var(--palette-teal-700)` |
| `--ac-website-preview-accent` | `var(--palette-teal-600)` |

**NEW_DOMAIN_TOKENS = 5**

No appearance-named APIs (`--clinic-green`, etc.).

---

## 7. Data-visualization color decisions

No chart/KPI series palette redesign in Batch 3. Dashboard chrome uses semantic surfaces/brand. Series colors (if any remain outside these files) deferred.

JUSTIFIED_DATA_VISUALIZATION in Batch 3 files = **0**

---

## 8. Before / after counts

| Metric | Value |
| --- | --- |
| BATCH3_FILES | 4 |
| BATCH3_RAW_COLORS_BEFORE (scannable) | **97** |
| BATCH3_RAW_COLORS_AFTER | **0** |
| BATCH3_LOCATIONS_MIGRATED | **97** |
| BATCH3_REMAINING_RAW_COLORS | **0** |
| MISSED_MIGRATION | **0** |

### Repository

| Metric | Value |
| --- | --- |
| REPO_HARDCODED_COLORS_BEFORE | **1152** (matched) |
| REPO_HARDCODED_COLORS_AFTER | **1055** |
| COUNT_CONSISTENCY | **PASS** (`1152 − 97 = 1055`) |
| TOTAL_LOCATIONS_REMOVED_FROM_FOUNDATION | **236** (`1291 − 1055`) |

---

## 9. Remaining raw-color classification

Post-migration scan of the three scannable Batch 3 files: **zero** non-var-def HEX/RGB.

| Classification | Count |
| --- | --- |
| JUSTIFIED_DATA_VISUALIZATION | 0 |
| JUSTIFIED_DOMAIN_COLOR | 0 (domain literals live only on token-bridge var-def lines / excluded token file) |
| BRAND_ASSET | 0 |
| DECORATIVE | 0 |
| TENANT_OR_CONTENT_COLOR | 0 (preview defaults tokenized; runtime tenant overrides via JS custom properties) |
| REQUIRES_FUTURE_TOKEN | 0 |
| MISSED_MIGRATION | **0** |
| NON_UI | 0 |
| FALSE_POSITIVE | 0 |

---

## 10. Intentional visible changes

| Change | Reason |
| --- | --- |
| Slate drift `#0F172A` / `#64748B` / `#E2E8F0` → ODS neutrals via platform tokens | Planned Batch 3 note + theme foundation |
| Success/danger chip text → stronger shared semantic (`--color-*-text`) | Foundation accessibility correction |
| URP Stitch primaries `#0050cb` / `#0066ff` → staff `--color-brand-primary` (`#2563EB`) | Unify staff brand; remove parallel blue HEX API |
| Encounter `with_practitioner` keeps `#7c3aed` via domain alias | Preserve clinical recognition |

---

## 11. Accessibility

Foundation ACCESSIBILITY_RISKS_REMAINING=0 preserved: stronger success/danger text, muted `#6B7280` family via tokens, focus via `--color-focus` / `--color-focus-ring`, no accent-orange small text introduced.

ACCESSIBILITY = **PASS**

---

## 12. ActiveClinic regression

| Check | Result |
| --- | --- |
| Staff shell `data-product` / `data-surface="staff"` | PASS |
| Platform colors partial loaded | PASS |
| `ac-app-tokens` / `ac-app` / `ac-urp` / `website-cms` tokenized | PASS |
| Routes / RBAC / workflows | Unchanged |

AC_THEME = **PASS**  
AC_REGRESSION = **PASS**

---

## 13. BlessBoard regression guard

No BlessBoard product CSS modified. Shared `colors.css` / `gp-ops` contracts unchanged in behavior (AC staff still overrides brand via surface selectors). Batch 1–2 automated tests remain green.

BB_REGRESSION_GUARD = **PASS**

---

## 14. Worktree integrity

- Scanner: **read-only** (`git ls-files` + file reads; no stash/reset)
- Pre-commit: tracked Batch 3 files contain tokenized CSS; `git stash list` shows only pre-existing user stashes (`V8`, `v7-mobile-perf`)
- No temporary `tmp-scan` stash
- Diff limited to intended Batch 3 + docs/tests

WORKTREE_INTEGRITY = **PASS**

---

## 15. Tests

- `tests/v2-04-color-migration-batch-3.test.js`
- Existing `tests/v2-04-platform-color-theme.test.js`, Batch 1–2 tests

---

## 16. Risks / debt

1. URP visual system slightly closer to ODS staff blue than original Stitch `#0050cb` — intentional brand unification.
2. `--status-encounter-with-practitioner` still carries one bridge HEX inside the excluded token file — acceptable domain alias.
3. Remaining ~1055 comparable locations belong to later batches (BB admin, website editors, AC public).

---

## Gate summary

```
VERSION=2.04
BRANCH=V4
MIGRATION_BATCH=3
SCOPE=ACTIVECLINIC_STAFF_APPLICATION

BATCH3_FILES=4
BATCH3_RAW_COLORS_BEFORE=97
BATCH3_RAW_COLORS_AFTER=0
BATCH3_LOCATIONS_MIGRATED=97
BATCH3_REMAINING_RAW_COLORS=0
MISSED_MIGRATION=0

FOUNDATION_COMPARABLE_BASELINE=1291
AFTER_BATCH_1=1223
AFTER_BATCH_2=1152
REPO_HARDCODED_COLORS_AFTER=1055
COUNT_CONSISTENCY=PASS

NEW_DOMAIN_TOKENS=5
FINAL=V2_04_COLOR_MIGRATION_BATCH_3_PASS
```
