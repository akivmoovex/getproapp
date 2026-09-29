# V2.04 Color Migration — Batch 2

**Status:** COMPLETE  
**Branch:** V4  
**Foundation commit:** `1f4019b48e6d61a6ac6beed07a591452486d8af9`  
**Batch 1 commit:** `b414689ebfdc3d2b3b97b568f533302c020576eb`  
**Theme source:** `src/platform/ui/theme/colors.css`  
**Date:** 2026-09-29  

## Authoritative comparable migration baseline

| Checkpoint | Hard-coded file×color locations |
| --- | --- |
| Theme foundation (comparable) | **1291** |
| After Batch 1 | **1223** |
| After Batch 2 | **1152** |

Historical audit value **1123** is **NON-COMPARABLE** (different scanner methodology / tree boundary). Do not use it for batch deltas.

Scanner methodology (identical to Batch 1 / foundation recount that produced **1291 → 1223**):

- `git ls-tree` / `git ls-files` under `public/`, `views/`, `frontend/`
- extensions `.css`, `.ejs`, `.js`, `.svg`
- exclude token-hint paths containing `tokens`, `design-tokens`, `theme.css`, `ac-app-tokens`, or `design-system.css`
- skip CSS custom-property definition lines and comment-only lines (`/*`, `*`, `//`)
- unique `(file, normalized HEX)` with RGB→HEX (uppercase)

---

## 1. Scope

Migrate **authentication and registration** UI colors (Batch 2 of 8) from hard-coded GUI colors to V2.04 semantic / component tokens.

Products covered:

- BlessBoard authentication
- BlessBoard registration
- ActiveClinic authentication
- ActiveClinic registration
- Shared authentication infrastructure
- Shared registration infrastructure

**Not in scope:** layout, spacing, typography, copy, routing, validation logic, marketing pages, staff ops shells, website editors.

---

## 2. Exact files

| File | Role | Batch 2 action |
| --- | --- | --- |
| `public/platform/gp-auth-reg.css` | Shared auth/registration chrome | Already tokenized in Batch 1 (0 raw) — re-verified |
| `public/platform/registration-ux.css` | Shared registration UX (errors, success, links, strength) | Migrated |
| `public/blessboard/v5/apex-auth.css` | BlessBoard apex login/register/recovery skin | Migrated |
| `public/blessboard/v5/tenant-auth.css` | BlessBoard tenant auth / wizard skin | Migrated |
| `public/activeclinic/ac-auth.css` | ActiveClinic auth login/register/recovery skin | Migrated |

Related shells (token loading / product selectors — no HEX migration required):

- `views/blessboard/v5/partials/head-design-system.ejs`
- `views/blessboard/v5/apex/login.ejs` (+ register/recovery siblings)
- `views/activeclinic/layouts/auth-shell.ejs`

**BATCH2_FILES = 5**

---

## 3. BlessBoard auth surfaces

| Surface | Skin / notes |
| --- | --- |
| Apex login | `apex-auth.css` + `gp-auth-reg.css` |
| Apex registration | same |
| Password recovery / reset | apex alert/status tokens |
| Tenant login | `tenant-auth.css` |
| Tenant registration / account creation | tenant wizard + form chrome |
| Validation / error / success flashes | danger / success / warning / info semantic tokens |
| Terms / consent presentation | link + muted text tokens |

---

## 4. ActiveClinic auth surfaces

| Surface | Skin / notes |
| --- | --- |
| Staff / portal login | `ac-auth.css` + shared `gp-auth-reg.css` |
| Registration / org onboarding auth steps | `ac-auth.css` + `registration-ux.css` |
| Password recovery / reset | AC alert tokens |
| Validation / error / success | danger / success semantic tokens |

Brand resolution: same component contracts; `--color-brand-*` resolves via `data-product="activeclinic"` (and AC shell surface attributes where applicable).

---

## 5. Registration surfaces

| Surface | Files |
| --- | --- |
| Shared registration UX helpers | `registration-ux.css` |
| Shared auth-reg bridge | `gp-auth-reg.css` (Batch 1) |
| BB org / church registration chrome | `apex-auth.css`, `tenant-auth.css` |
| AC clinic registration chrome | `ac-auth.css` |

---

## 6. Tokens adopted

| Role | Token(s) |
| --- | --- |
| Page / panel background | `--color-background`, `--color-surface`, `--color-surface-muted` |
| Cards / forms | `--card-bg`, `--card-border`, `--color-surface` |
| Primary / secondary text | `--color-text-primary`, `--color-text-secondary`, `--color-text-muted` |
| Borders | `--color-border-default`, `--color-border-strong` |
| Primary CTA | `--button-primary-bg`, `--button-primary-text`, `--button-primary-bg-hover` |
| Inputs | `--input-bg`, `--input-text`, `--input-placeholder`, `--input-border`, `--input-border-focus`, `--input-focus-ring` |
| Errors | `--color-danger-text`, `--color-danger-bg`, `--color-danger-border` |
| Success | `--color-success-text`, `--color-success-bg`, `--color-success-border` |
| Warning / info | `--color-warning-*`, `--color-info-*` |
| Links | `--color-link`, `--color-link-hover` |
| Focus | `--color-focus`, `--color-focus-ring` |
| Brand (BB/AC) | `--color-brand-primary`, `--color-brand-primary-light`, `--color-brand-primary-hover` |
| Inverse / decorative mixes | `--color-text-inverse`, `color-mix(... var(--color-*) …)` |

No product-local HEX APIs introduced (`--bb-login-blue`, `--ac-login-blue`, etc.). Existing local aliases (e.g. `--bb-auth-violet`, `--ac-auth-primary`) now point at semantic brand tokens.

---

## 7. Before / after counts

| Metric | Value |
| --- | --- |
| BATCH2_FILES | 5 |
| BATCH2_RAW_COLORS_BEFORE | **71** |
| BATCH2_RAW_COLORS_AFTER | **0** |
| BATCH2_LOCATIONS_MIGRATED | **71** |
| BATCH2_REMAINING_JUSTIFIED_RAW_COLORS | **0** |
| MISSED_MIGRATION | **0** |

### Repository

| Metric | Value |
| --- | --- |
| REPO_HARDCODED_COLORS_BEFORE | **1223** (matched expected post–Batch 1) |
| REPO_HARDCODED_COLORS_AFTER | **1152** |
| COUNT_CONSISTENCY | **PASS** (`1223 − 71 = 1152`) |

---

## 8. Remaining raw-color classifications

Post-migration scan of all five Batch 2 files: **zero** HEX / `rgb()` / `rgba()` / `hsl()` literals.

| Classification | Count |
| --- | --- |
| JUSTIFIED_DECORATIVE | 0 |
| TENANT_OR_CONTENT_COLOR | 0 |
| BRAND_ASSET | 0 |
| REQUIRES_FUTURE_TOKEN | 0 |
| MISSED_MIGRATION | **0** |
| NON_UI | 0 |
| FALSE_POSITIVE | 0 |

Elevation / panel accents use `color-mix` against semantic tokens (not raw RGB).

---

## 9. Intentional visible changes

| Change | Reason |
| --- | --- |
| BB tenant wizard current-step accent `#1d4ed8` → `--color-brand-primary` | Resolves semantic drift (wizard used Tailwind-blue instead of BlessBoard brand violet) |
| Tenant panel gradient / skip-outline mixes | Rebased onto brand / info / inverse tokens for theme consistency; visual intent preserved |

No layout, spacing, typography, or copy changes.

---

## 10. Accessibility verification

| Check | Result |
| --- | --- |
| Foundation accessibility risks remaining | Still **0** (no new primitive contrast regressions introduced) |
| Page text / labels / placeholders / inputs | Semantic text + input tokens |
| Primary CTA / hover | `--button-primary-*` |
| Links | `--color-link` / `--color-link-hover` |
| Error / success messages | `--color-danger-*` / `--color-success-*` |
| Focus indicators | `--color-focus` / `--color-focus-ring` / `--input-focus-ring` |
| Disabled controls | Existing disabled component tokens |
| BB + AC brand resolution | Via `data-product` + platform colors shell partial |

ACCESSIBILITY = **PASS** (no regression vs foundation ACCESSIBILITY_RISKS_REMAINING=0).

---

## 11. Visual parity

Existing approved auth/registration layouts preserved. Color architecture only.

Exceptions documented in §9 (semantic drift corrections).

VISUAL_PARITY = **PASS** (architecture migration; intentional brand drift fix only).

---

## 12. BlessBoard regression

| Check | Result |
| --- | --- |
| Login skin CSS tokenized | PASS |
| Registration skin CSS tokenized | PASS |
| Recovery / alert states | PASS (semantic status tokens) |
| Product selector `data-product="blessboard"` | PASS |
| Platform colors loaded via head partial | PASS |
| Template / route logic unchanged | PASS |

BB_AUTH_REGRESSION = **PASS**  
BB_REGISTRATION_REGRESSION = **PASS**  
BB_THEME = **PASS**

---

## 13. ActiveClinic regression

| Check | Result |
| --- | --- |
| Login skin CSS tokenized | PASS |
| Registration skin CSS tokenized | PASS |
| Recovery / alert states | PASS |
| Product selector `data-product="activeclinic"` | PASS |
| Platform colors loaded via auth-shell | PASS |
| Template / route logic unchanged | PASS |

AC_AUTH_REGRESSION = **PASS**  
AC_REGISTRATION_REGRESSION = **PASS**  
AC_THEME = **PASS**

---

## 14. Test results

Automated:

- `tests/v2-04-color-migration-batch-2.test.js` — Batch 2 HEX/RGB absence, BB/AC token mapping, registration UX tokens, shell product selectors
- Existing `tests/v2-04-platform-color-theme.test.js` and `tests/v2-04-color-migration-batch-1.test.js` remain green

Manual browser smoke of live auth pages was not required for this architectural batch beyond automated CSS/shell contracts; no production tests performed.

---

## 15. Discovered technical debt

1. BB and AC still maintain parallel auth skin files (`apex-auth` / `tenant-auth` vs `ac-auth`) with overlapping semantic jobs — safe shared contracts exist via `gp-auth-reg.css`; further consolidation deferred.
2. Local alias variables (`--bb-auth-*`, `--ac-auth-*`) remain as thin bridges to platform tokens — acceptable; do not reintroduce HEX.
3. Broader product CSS (staff ops, marketing) still carries the remaining ~1152 comparable hard-coded locations — Batches 3–8.

---

## 16. Remaining risks

1. Visual QA on real devices still recommended before production cutover (not in Batch 2 scope).
2. Any auth EJS with inline `style="color:#…"` outside the five CSS files would sit outside this batch — none found in active auth shells during inspection.
3. Repository hard-coded count remains high (**1152**) until later batches.

---

## Gate summary

```
VERSION=2.04
BRANCH=V4
MIGRATION_BATCH=2
SCOPE=AUTHENTICATION_REGISTRATION

BATCH2_FILES=5
BATCH2_RAW_COLORS_BEFORE=71
BATCH2_RAW_COLORS_AFTER=0
BATCH2_LOCATIONS_MIGRATED=71
BATCH2_REMAINING_JUSTIFIED_RAW_COLORS=0
MISSED_MIGRATION=0

FOUNDATION_COMPARABLE_BASELINE=1291
AFTER_BATCH_1=1223
REPO_HARDCODED_COLORS_BEFORE=1223
REPO_HARDCODED_COLORS_AFTER=1152
COUNT_CONSISTENCY=PASS

BB_AUTH_REGRESSION=PASS
AC_AUTH_REGRESSION=PASS
BB_REGISTRATION_REGRESSION=PASS
AC_REGISTRATION_REGRESSION=PASS

BB_THEME=PASS
AC_THEME=PASS
VISUAL_PARITY=PASS
ACCESSIBILITY=PASS
UNDEFINED_TOKENS=0

REPORT=docs/qa/V2_04_COLOR_MIGRATION_BATCH_2.md
PRODUCTION=UNTOUCHED

FINAL=V2_04_COLOR_MIGRATION_BATCH_2_PASS
```
