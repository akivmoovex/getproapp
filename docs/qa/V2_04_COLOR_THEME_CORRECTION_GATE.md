# V2.04 — Color Theme Mid-Migration Correction Gate

**VERSION:** 2.04  
**BRANCH:** V4  
**GATE:** COLOR_THEME_MID_MIGRATION_CORRECTION  
**DATE:** 2026-09-29  
**BASE APPLICATION COMMIT:** `9caee8d1d82f75521bbfa4924625d34ed65d0d00`  
**AUDIT:** `docs/qa/V2_04_COLOR_THEME_MID_MIGRATION_AUDIT.md`  
**SOURCE OF TRUTH:** `src/platform/ui/theme/colors.css`  

**PRODUCTION:** UNTOUCHED  
**RAW-COLOR MIGRATION:** None (repo remains **592**)

---

## 1. Baseline

| Check | Result |
| --- | --- |
| Branch | `V4` |
| `HEAD` / `origin/V4` (before gate) | `9caee8d1…` |
| Temporary scan stash | None (existing stashes are unrelated V8/V7 WIP) |
| V10 / DB / deploy | Untouched |

---

## 2. All 25 undefined-token findings

All 25 mid-audit “undefined” names were **genuine relative to the V2.04 foundation + Batch bridges**. They resolved at runtime only when legacy `public/theme.css` / `public/styles.css` loaded. No typo/false-positive among the 25 color names.

| TOKEN | FILE | CONTEXT | PRODUCT | COMPONENT | INTENDED_SEMANTIC_PURPOSE | ROOT_CAUSE |
| --- | --- | --- | --- | --- | --- | --- |
| `--btn-primary-bg` | `design-system.css` | `.btn.btn--primary` | Shared | Primary button | Primary CTA fill | STALE_TOKEN_NAME → use `--button-primary-bg` |
| `--btn-primary-hover` | `design-system.css` | primary hover | Shared | Primary button | Primary CTA hover | STALE_TOKEN_NAME → `--button-primary-bg-hover` |
| `--btn-primary-text` | `design-system.css` | primary label | Shared | Primary button | On-primary text | STALE_TOKEN_NAME → `--button-primary-text` |
| `--color-error` | `design-system.css` | input error focus | Shared | Form error | Danger/error emphasis | STALE_TOKEN_NAME → `--color-danger` |
| `--color-outline` | `m3-modal.css`, `design-system.css` | borders / DS alias | Shared | Modal / DS border | Default border | STALE_TOKEN_NAME → `--color-border-default` |
| `--color-outline-strong` | `m3-modal.css`, `design-system.css` | strong border | Shared | Modal close / DS | Strong border | STALE_TOKEN_NAME → `--color-border-strong` |
| `--color-primary` | `m3-modal.css`, `design-system.css` | brand accents | Shared | Modal / text btn | Brand primary | STALE_TOKEN_NAME → `--color-brand-primary` |
| `--color-scrim-join-backdrop` | `m3-modal.css` | join modal backdrop | Shared | Modal overlay | Scrim / overlay | STALE_TOKEN_NAME → `--modal-overlay` |
| `--color-surface-variant` | `design-system.css` | DS `:root` alias | Shared | Surface alt | Subtle surface | STALE_TOKEN_NAME → `--color-surface-subtle` |
| `--color-text-tertiary` | `design-system.css` | DS soft text alias | Shared | Soft text | Muted text | STALE_TOKEN_NAME → `--color-text-muted` |
| `--flash-error-bg/border/text` | `design-system.css` | state-block / status | Shared | Alert / flash | Danger feedback | STALE_TOKEN_NAME → `--color-danger-*` |
| `--flash-info-bg/border/text` | `design-system.css` | state-block info | Shared | Alert / flash | Info feedback | STALE_TOKEN_NAME → `--color-info-*` |
| `--flash-success-bg/border/text` | `design-system.css` | state-block success | Shared | Alert / flash | Success feedback | STALE_TOKEN_NAME → `--color-success-*` |
| `--muted` | `design-system.css` | meta / help / status | Shared | Muted text | Secondary/muted copy | STALE_TOKEN_NAME → `--color-text-muted` |
| `--primary-softer-bg` | `design-system.css` | secondary/text hover | Shared | Soft brand fill | Brand soft surface | STALE_TOKEN_NAME → `--color-brand-primary-light` |
| `--surface` | `design-system.css` | secondary button bg | Shared | Surface | Card/surface fill | STALE_TOKEN_NAME → `--color-surface` |
| `--wf-primary` | `design-system.css` | secondary border | Shared | Brand | Brand primary | STALE_TOKEN_NAME → `--color-brand-primary` |
| `--wf-primary-dark` | `design-system.css` | hover / DS alias | Shared | Brand hover | Brand primary hover | STALE_TOKEN_NAME → `--color-brand-primary-hover` |
| `--wf-primary-rgb` | `design-system.css` | DS soft rgba | Shared | Brand soft | Brand soft mix | WRONG_TOKEN_REFERENCE → `color-mix(...brand-primary...)` |

### Breakdown

| Class | Count |
| --- | ---: |
| `GENUINE_UNDEFINED_TOKENS` (vs V2.04) | **25** |
| `FALSE_POSITIVE_UNDEFINED_TOKENS` | **0** |
| Intentionally optional (color) | **0** |

### Fallbacks (`var(--token, fallback)`)

None of the 25 color references used intentional optional fallbacks. Classification for each: **SHOULD_USE_EXISTING_TOKEN**.

Non-color shell metrics still referenced by `m3-modal.css` (`--m3-modal-duration*`, `--modal-z-dialog`, sizes) remain **INTENTIONALLY_OPTIONAL** layout/motion tokens supplied by legacy theme — out of color-gate scope.

---

## 3. Corrections made

### `public/design-system.css`

- Remapped DS `:root` color aliases to V2.04 (`--color-surface-subtle`, `--color-brand-*`, `--color-border-default`).
- Stopped overriding platform `--color-text-muted` / `--color-border-strong`.
- Buttons → `--button-primary-*`.
- Flash / muted / surface / WF → semantic `--color-*` / brand tokens.

### `public/m3-modal.css`

- Borders → `--color-border-default` / `--color-border-strong`.
- Brand hover tint → `--color-brand-primary`.
- Join backdrop → `--modal-overlay`.

### Appearance consumers (completed Batch 4)

- `platform-admin` / `hq-admin` / `branch-admin` / `member-portal`: `--bb-violet*` → `--bb-color-primary*`.
- `ac-app.css`: `.ac-badge--teal` → `--color-brand-accent` (+ soft mix); `--gp-ops-canvas` → `--color-background`.

### Bridges

- `design-tokens.css`: `--bb-shadow-focus` → `--color-focus-ring` (depth 5→4); `--status-*` → `--badge-*`; keep `--bb-violet*` as `@deprecated` for Batch 7.
- `ac-app-tokens.css`: introduce `--ac-brand-accent*`; keep `--ac-teal*` as deprecated aliases.

### Tests

- Added `tests/v2-04-color-token-resolution.test.js`.
- Updated Batch 4 assertion for badge-backed status aliases.

**No new HEX introduced. No Batch 5–8 raw-color migration.**

---

## 4. Semantic duplication decisions

| Group | Canonical | Alias retained | Decision |
| --- | --- | --- | --- |
| Published ≡ success | `--badge-success-*` | `--status-published-*` | VALID_ALIAS (resolved) |
| Draft ≡ warning | `--badge-warning-*` | `--status-draft-*` | VALID_ALIAS (resolved) |
| Inactive ≡ neutral | `--badge-neutral-*` | `--status-inactive-*` | VALID_ALIAS (resolved) |

AC appointment/encounter tokens **not** merged (true domain differences).

| Metric | Value |
| --- | ---: |
| Groups before | 3 |
| Groups resolved | 3 |
| Groups remaining (active conflict) | 0 |

---

## 5. Appearance-name decisions

| Token | Classification | Action |
| --- | --- | --- |
| `--bb-violet` / `--bb-violet-deep` | LEGACY_COMPATIBILITY_ALIAS | Keep for Batch 7; completed consumers migrated |
| `--ac-teal` / `--ac-teal-soft` | LEGACY_COMPATIBILITY_ALIAS | Keep; staff consumer uses `--color-brand-accent` / `--ac-brand-accent` |

| Metric | Value |
| --- | ---: |
| Before | 4 |
| `INVALID_APPEARANCE_NAMED_TOKENS_AFTER` | **0** |

---

## 6. Alias-chain correction

| Token | Before | After |
| --- | ---: | ---: |
| `--bb-shadow-focus` | 5 (`→ bb-color-focus-ring → color-focus-ring → brand → palette`) | **4** (`→ color-focus-ring → brand → palette`) |
| Chains ≥5 after | — | **0** |

`MAX_ALIAS_CHAIN_BEFORE=5`  
`MAX_ALIAS_CHAIN_AFTER=4`

---

## 7. Deprecated alias consumer

| Before | After |
| --- | --- |
| `ac-app.css` ×4 `var(--gp-ops-canvas)` | `var(--color-background)` |

`--gp-ops-*` definitions retained (other/non-color consumers + future shells).

`DEPRECATED_ALIAS_CONSUMERS_AFTER=0`

---

## 8. Compatibility alias inventory (foundation `--product-*` + `--gp-ops-*`)

| Alias family | Count | Classification |
| --- | ---: | --- |
| `--product-*` | 10 | STILL_REQUIRED / REQUIRED_BY_UNMIGRATED_BATCH_5–8 (auth/ops shells) |
| `--gp-ops-*` | 7 | STILL_REQUIRED (spacing/radius + residual chrome; color canvas consumer removed) |
| `--bb-violet*` | 2 (bridge) | REQUIRED_BY_UNMIGRATED_BATCH_7 |
| `--ac-teal*` | 2 (bridge) | STILL_REQUIRED until remaining AC consumers cleared |

`COMPATIBILITY_ALIASES_BEFORE=17` (foundation)  
`COMPATIBILITY_ALIASES_AFTER=17` (foundation unchanged; safe removals deferred to Batch 8)

---

## 9. Product isolation

| Metric | Value |
| --- | ---: |
| `BB_TOKEN_LEAK_INTO_AC` | 0 |
| `AC_TOKEN_LEAK_INTO_BB` | 0 |
| `SHARED_COMPONENT_PRODUCT_COUPLING` | 0 |

---

## 10. Completed-scope / repo raw colors

| Metric | Value |
| --- | ---: |
| `COMPLETED_SCOPE_RAW_COLORS` | 0 |
| `MISSED_COMPLETED_SCOPE_MIGRATIONS` | 0 |
| `REPO_HARDCODED_COLORS` | **592** (unchanged) |

---

## 11. Accessibility

Token remaps preserve AA-oriented foundation values (muted/disabled `#6B7280`, stronger success/danger chip text, brand focus rings). No new weak muted/orange-as-text paths.

| Metric | Value |
| --- | --- |
| `ACCESSIBILITY` | PASS |
| `NEW_ACCESSIBILITY_RISKS` | 0 |

---

## 12. Tests

| Suite | Result |
| --- | --- |
| `v2-04-color-token-resolution.test.js` | PASS |
| `v2-04-platform-color-theme.test.js` | PASS |
| `v2-04-color-migration-batch-{1,2,3,4}.test.js` | PASS |

| Metric | Value |
| --- | --- |
| `BB_THEME` / `AC_THEME` | PASS (foundation + bridges) |
| `BB_REGRESSION` / `AC_REGRESSION` | PASS |
| `UNDEFINED_TOKENS` (color, completed scope) | 0 |
| `CIRCULAR_REFERENCES` | 0 |
| `TESTS` | PASS |

---

## 13. Batch 5 readiness

Architecture defects from the mid-audit are corrected. Website editor CSS (170 locations) remains unmigrated by design.

**BATCH_5_READINESS=PASS**

---

## 14. Decision

**FINAL=V2_04_COLOR_THEME_CORRECTION_GATE_PASS**
