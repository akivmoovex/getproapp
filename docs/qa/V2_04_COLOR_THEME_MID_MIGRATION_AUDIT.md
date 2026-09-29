# V2.04 — Color Theme Mid-Migration Cross-Product Audit

**VERSION:** 2.04  
**BRANCH:** V4  
**MODE:** READ-ONLY AUDIT  
**AUDIT:** MID_MIGRATION_CROSS_PRODUCT  
**DATE:** 2026-09-29  
**HEAD:** `9caee8d1d82f75521bbfa4924625d34ed65d0d00`  
**SOURCE OF TRUTH:** `src/platform/ui/theme/colors.css`  
**SPEC:** `docs/design/PLATFORM_COLOR_SYSTEM.md`  

**APPLICATION_CODE_CHANGED:** NO  
**PRODUCTION:** UNTOUCHED  

---

## 1. Migration progress

| Checkpoint | Hard-coded file×color locations |
| --- | ---: |
| Foundation (comparable) | 1291 |
| After Batch 1 | 1223 |
| After Batch 2 | 1152 |
| After Batch 3 | 1055 |
| After Batch 4 (current) | **592** |
| **Total removed** | **699** |

| Batch | Scope | Status |
| --- | --- | --- |
| 1 | Shared platform components | COMPLETE |
| 2 | Authentication + registration | COMPLETE |
| 3 | ActiveClinic staff application | COMPLETE |
| 4 | BlessBoard management / member | COMPLETE |
| 5 | Website editors | NOT STARTED |
| 6 | ActiveClinic public website | NOT STARTED |
| 7 | BlessBoard public website | NOT STARTED |
| 8 | Remaining cleanup | NOT STARTED |

### Repository state

| Check | Result |
| --- | --- |
| Branch | `V4` |
| `HEAD` | `9caee8d1d82f75521bbfa4924625d34ed65d0d00` |
| `HEAD == origin/V4` | YES |
| Includes migration commit `9caee8d1…` | YES |
| Scan mode | READ-ONLY (no stash / reset / DB / deploy) |
| Working tree | Dirty with unrelated untracked `* 2.*` duplicates only — **not** used by git-tracked scanner |

---

## 2. Authoritative count verification

Scanner methodology (unchanged from Batches 1–4):

- `git ls-files public views frontend`
- Extensions: `.css` `.ejs` `.js` `.svg`
- Exclude token-hint paths: `tokens`, `design-tokens`, `theme.css`, `ac-app-tokens`, `design-system.css`
- Skip CSS custom-property **definition** lines (`--name:`)
- Skip comment-only lines
- Unique `(file, HEX)` including RGB→HEX normalization

| Metric | Value |
| --- | --- |
| Expected | 592 |
| Measured | **592** |
| `COLOR_COUNT` | **592** |
| `COUNT_CONSISTENCY` | **PASS** |

---

## 3. Token inventory

Inventory of unique tokens declared in `src/platform/ui/theme/colors.css` (first declaration wins; product selector overrides do not double-count).

| Category | Count | Notes |
| --- | ---: | --- |
| PRIMITIVE | **44** | `--palette-*` scales only |
| PLATFORM_SEMANTIC | **35** | Neutrals, disabled, success/warning/danger/info, link/focus/selection |
| BRAND | **7** | `--color-brand-primary*` + accent + on-primary |
| COMPONENT | **57** | button / input / card / nav / table / modal / badge |
| ACTIVECLINIC_DOMAIN | **5** | In `public/activeclinic/ac-app-tokens.css` (Batch 3) |
| BLESSBOARD_DOMAIN | **9** | In `public/blessboard/v5/design-tokens.css` (Batch 4) |
| COMPATIBILITY_ALIAS | **17** | `--product-*` (10) + `--gp-ops-*` (7) on product/staff selectors |

Foundation unique API size: **160** (`44+35+7+57+17`).

Domain tokens live in product alias bridges (not in `colors.css`), which is correct ownership under platform-architecture guardrails.

---

## 4. Domain-token review (14)

### ActiveClinic (5)

| TOKEN | PRODUCT | SEMANTIC_PURPOSE | RESOLVES_TO | CONSUMERS | GENERIC_PLATFORM_EQUIVALENT | KEEP_PRODUCT_SPECIFIC | RATIONALE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--status-appointment-requested` | AC | Appointment request / intake pending | `var(--color-warning-text)` | `ac-app.css` | `--color-warning-text` / `--badge-warning-text` | YES | Clinical queue label; warning is correct but name encodes appointment workflow |
| `--status-appointment-waiting` | AC | Waiting-room / arrived queue | `var(--color-brand-primary)` | `ac-app.css` | `--color-brand-primary` (staff blue) | YES | Operational “in queue” cue; not generic success |
| `--status-encounter-with-practitioner` | AC | In-consultation clinical state | `#7c3aed` (bridge literal) | `ac-app.css` | None (deliberately distinct) | YES | Must not collapse into brand/danger/info; recognition cue |
| `--ac-website-preview-primary` | AC | CMS preview chrome primary while staff shell is blue | `var(--palette-teal-700)` | `website-cms.css` | Public AC brand primary | YES | Staff blue vs public teal dual-surface lock |
| `--ac-website-preview-accent` | AC | CMS preview accent (public teal) | `var(--palette-teal-600)` | `website-cms.css` | Public AC brand hover | YES | Same dual-surface reason |

### BlessBoard (9)

| TOKEN | PRODUCT | SEMANTIC_PURPOSE | RESOLVES_TO | CONSUMERS | GENERIC_PLATFORM_EQUIVALENT | KEEP_PRODUCT_SPECIFIC | RATIONALE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--status-published-bg` | BB | Published content badge background | `var(--color-success-bg)` | **0** | `--badge-success-bg` | NO* | Pure alias of success; prefer component badge tokens |
| `--status-published-text` | BB | Published badge text | `var(--color-success-text)` | **0** | `--badge-success-text` | NO* | Same |
| `--status-published-border` | BB | Published badge border | `var(--color-success-border)` | **0** | `--badge-success-border` | NO* | Same |
| `--status-draft-bg` | BB | Draft content badge background | `var(--color-warning-bg)` | **0** | `--badge-warning-bg` | NO* | Pure alias of warning |
| `--status-draft-text` | BB | Draft badge text | `var(--color-warning-text)` | **0** | `--badge-warning-text` | NO* | Same |
| `--status-draft-border` | BB | Draft badge border | `var(--color-warning-border)` | **0** | `--badge-warning-border` | NO* | Same |
| `--status-inactive-bg` | BB | Inactive / muted badge background | `var(--color-surface-subtle)` | **0** | `--badge-neutral-bg` | NO* | Prefer `--badge-neutral-*` |
| `--status-inactive-text` | BB | Inactive badge text | `var(--color-text-secondary)` | **0** | `--badge-neutral-text` | NO* | Same |
| `--status-inactive-border` | BB | Inactive badge border | `var(--color-border-default)` | **0** | `--badge-neutral-border` | NO* | Same |

\*Keep as **VALID_ALIAS** until Batch 5–8 consumers adopt platform badge tokens; do **not** merge/delete mid-migration. Current BB admin CSS uses `--bb-color-success*` for published pills instead of these aliases.

### Cross-product naming collision watchlist

| Concept | AC | BB | Platform |
| --- | --- | --- | --- |
| Pending / draft | `--status-appointment-requested`, `--ac-status-pending` | `--status-draft-*` | `--color-warning*` / `--badge-warning*` |
| Active / in-progress | `--status-appointment-waiting` (brand) | (none domain) | brand primary / info |
| Published / success | (uses success semantic directly) | `--status-published-*` | `--badge-success*` |
| Inactive | (neutral / muted) | `--status-inactive-*` | `--badge-neutral*` |

No merge performed in this audit — consolidation opportunities only.

---

## 5. Semantic duplication

| Group | Tokens | Classification |
| --- | --- | --- |
| Published ≡ success | BB `--status-published-*` ↔ `--badge-success-*` / `--color-success-*` | **VALID_ALIAS** / **POSSIBLE_DUPLICATION** |
| Draft / pending ≡ warning | BB `--status-draft-*` ↔ AC `--status-appointment-requested` / `--ac-status-pending` ↔ `--badge-warning-*` | **POSSIBLE_DUPLICATION** (names differ; meaning = caution/pending) — AC appointment name remains domain-justified |
| Inactive ≡ neutral | BB `--status-inactive-*` ↔ `--badge-neutral-*` | **SHOULD_BE_COMPONENT_TOKEN** (prefer badge-neutral) |

Not counted as duplication (true domain differences):

- `--status-appointment-waiting` → brand primary (**TRUE_PRODUCT_DOMAIN_DIFFERENCE**)
- `--status-encounter-with-practitioner` → `#7c3aed` (**TRUE_PRODUCT_DOMAIN_DIFFERENCE**)
- `--ac-website-preview-*` teal under staff blue (**TRUE_PRODUCT_DOMAIN_DIFFERENCE**)

| Metric | Value |
| --- | ---: |
| `SEMANTIC_DUPLICATION_GROUPS` | **3** |

---

## 6. Naming audit

### Appearance-named tokens

Foundation (`colors.css`): **0** appearance-named semantic APIs (primitives correctly use hue names).

Product bridges still expose compatibility hue names:

| Token | File | Layer |
| --- | --- | --- |
| `--ac-teal` | `ac-app-tokens.css` | COMPATIBILITY_ALIAS |
| `--ac-teal-soft` | `ac-app-tokens.css` | COMPATIBILITY_ALIAS |
| `--bb-violet` | `design-tokens.css` | COMPATIBILITY_ALIAS |
| `--bb-violet-deep` | `design-tokens.css` | COMPATIBILITY_ALIAS |

| Metric | Value |
| --- | ---: |
| `APPEARANCE_NAMED_TOKENS` | **4** (compat aliases only; target 0 long-term) |
| `OVERLY_SPECIFIC_TOKENS` | **0** |

Domain APIs themselves (`--status-*`, `--ac-website-preview-*`) are semantic — PASS for Batch 3–4 naming intent.

---

## 7. Token-resolution audit (Batches 1–4)

Scope: completed Batch 1–4 CSS consumers + foundation + product bridges.

| Check | Count | Detail |
| --- | ---: | --- |
| `UNDEFINED_TOKENS` | **25** | Color-ish `var(--*)` in Batch 1 files `design-system.css` / `m3-modal.css` not defined in V2.04 foundation/bridges: `--btn-primary-*`, `--wf-primary*`, `--flash-*`, `--color-outline*`, `--color-primary`, `--muted`, `--surface`, etc. **Runtime-defined** via legacy `public/theme.css` / `public/styles.css`. No raw HEX regression; deferred Batch 8 debt |
| `CIRCULAR_REFERENCES` | **0** | — |
| `EXCESSIVE_ALIAS_CHAINS` | **1** | `--bb-shadow-focus` depth ≥5 (non-color focus shadow chain in design-tokens) |
| `DEPRECATED_ALIAS_CONSUMERS` | **1** | Color `--gp-ops-canvas` still consumed in `ac-app.css`; `--product-*` consumer count in completed scope = **0** |
| `DIRECT_PRIMITIVE_CONSUMERS` | **0** | No `var(--palette-*)` in completed feature CSS (bridges may reference primitives — allowed) |

**Verdict:** Core Batch 2–4 product CSS resolves through V2.04 tokens. Legacy ODS/M3 shell CSS still depends on `theme.css` — technical debt, not a Batch 5 architecture blocker.

---

## 8. Product-isolation audit

Searched git-tracked CSS/EJS/JS for BB domain tokens inside ActiveClinic trees, AC domain tokens inside BlessBoard/church trees, and both inside shared `public/platform` / `src/platform` consumers.

| Metric | Value | Target |
| --- | ---: | ---: |
| `BB_TOKEN_LEAK_INTO_AC` | **0** | 0 |
| `AC_TOKEN_LEAK_INTO_BB` | **0** | 0 |
| `SHARED_COMPONENT_PRODUCT_COUPLING` | **0** | 0 |

Shared Batch 1 components consume `--button-*` / `--color-*` / `--nav-*` / `--badge-*` — brand resolves via `data-product`, not product-domain tokens.

---

## 9. Brand resolution

Evidence from `colors.css` product selectors (no product-specific component CSS required):

| Surface | Selector | Primary resolves to |
| --- | --- | --- |
| BlessBoard | `[data-product="blessboard"]` (+ compat) | Violet `#6C5CE7` |
| ActiveClinic public | `[data-product="activeclinic"]` default / `data-surface="public"` | Teal `#006068` |
| ActiveClinic staff | `[data-surface="staff"]` / `body.ac-app-body` | Blue `#2563EB` |

Representative component mapping (all inherit brand):

| Component | Token | Brand-dependent? |
| --- | --- | --- |
| Primary button | `--button-primary-bg` | YES → `--color-brand-primary` |
| Secondary button | `--button-secondary-*` | YES |
| Link | `--color-link` | YES |
| Input focus | `--input-border-focus` / `--input-focus-ring` | YES |
| Nav active | `--nav-active-bg/text` | YES |
| Card | `--card-bg/border/text` | Surfaces + text (product-tinted background) |
| Table | `--table-*` | Row hover uses brand-light |
| Modal | `--modal-*` | Surface + overlay |
| Alert / badge | `--badge-success|warning|danger|info-*` | Shared semantic states (correct) |

**Verdict:** Brand-dependent chrome resolves correctly without product-specific button/input CSS. AC dual-surface (teal vs blue) remains intact.

---

## 10. Semantic-state consistency

| State | Platform token | BB | AC staff | Divergence |
| --- | --- | --- | --- | --- |
| SUCCESS | `--color-success*` | Same | Same | None unexplained |
| WARNING | `--color-warning*` | Same | Same (+ appointment-requested alias) | Documented domain alias |
| DANGER | `--color-danger*` | Same | Same | None |
| INFO | `--color-info*` | Same | Same | None |
| DISABLED | `--color-disabled-*` | Same | Same | None |
| FOCUS | `--color-focus*` → brand | Violet | Blue/teal by surface | **Expected** brand binding |

Unexplained divergence: **none**. Documented domain exception: encounter violet `#7c3aed`.

---

## 11. Accessibility recheck

| Area | Finding |
| --- | --- |
| Foundation mitigations | Still in force (`#6B7280` muted/disabled; stronger success/danger chip text; accent-readable for orange text) |
| Completed Batch 1–4 files | No reintroduction of audit-FAIL muted literals (`#8A94A6`, `#9A93A8`) as raw colors |
| Focus | Component tokens use `--color-focus-ring` / brand mix |
| Domain encounter violet | Pre-existing justified literal; contrast on soft surfaces not newly broken by migration |

| Metric | Value |
| --- | --- |
| `ACCESSIBILITY` | **PASS** |
| `NEW_ACCESSIBILITY_RISKS` | **0** |

Residual (not new): verify `#7c3aed` encounter text on soft backgrounds during AC visual QA; migrate `design-system` flash tokens off legacy theme in Batch 8.

---

## 12. Completed-scope raw-color verification

Re-scanned Batch 1–4 application files (excluding token-hint files):

| Metric | Value | Target |
| --- | ---: | ---: |
| `COMPLETED_SCOPE_RAW_COLORS` | **0** | 0 |
| `MISSED_COMPLETED_SCOPE_MIGRATIONS` | **0** | 0 |

---

## 13. Remaining 592 classification

Read-only classification of current hard-coded locations (do **not** migrate in this audit):

| Scope | Count | Top files |
| --- | ---: | --- |
| `BATCH_5_WEBSITE_EDITORS` | **170** | `website-inline-edit.css` (36), `website-change-manager-ui.css` (32), `website-theme-gallery.css` (25), history/scope-list/media/styles/add-section… |
| `BATCH_6_AC_PUBLIC` | **105** | `acw-platform.css` (47), `ac-public.css` (39), wellness theme (9), patient assets |
| `BATCH_7_BB_PUBLIC` | **150** | `tenant-public.css` (71), `apex.css` (65), contemporary-fellowship theme (14) |
| `BATCH_8_CLEANUP` | **149** | `public/styles.css` (61), admin CRM/finance/field-agent views, leftover SVGs in product trees, misc EJS |
| `OUT_OF_SCOPE_OR_JUSTIFIED` | **18** | Marketing/feature SVGs, favicon |
| **Sum** | **592** | |

| Metric | Value |
| --- | --- |
| `REMAINING_SCOPE_RECONCILIATION` | **PASS** (`170+105+150+149+18 = 592`) |

---

## 14. Batch 5 readiness

Website editor surfaces (`public/platform/website-*.css`) still carry raw colors and largely do **not** yet consume V2.04 component tokens. Architecture is ready to receive them.

| Editor concept | Classification | Existing / proposed |
| --- | --- | --- |
| Editor canvas | EXISTING_TOKEN_SUFFICIENT | `--color-background` / `--color-surface` |
| Editing toolbar | EXISTING_TOKEN_SUFFICIENT | `--color-surface-elevated`, `--nav-*`, `--border-*` |
| Selection | EXISTING_TOKEN_SUFFICIENT | `--color-selection` |
| Hover outline | EXISTING_TOKEN_SUFFICIENT | `--color-focus` / `--color-focus-ring` |
| Editable region | NEW_COMPONENT_TOKEN_RECOMMENDED | Optional `--editor-editable-outline` / `--editor-editable-bg` (defer unless Batch 5 needs clear API) |
| Publish state | DOMAIN_ALIAS_APPROPRIATE | Prefer `--badge-success-*` (BB `--status-published-*` only if already wired) |
| Draft state | DOMAIN_ALIAS_APPROPRIATE | Prefer `--badge-warning-*` |
| Preview state | EXISTING_TOKEN_SUFFICIENT | Brand + AC `--ac-website-preview-*` where staff/public diverge |
| Media library | EXISTING_TOKEN_SUFFICIENT | Surface / border / text tokens |
| Upload progress | EXISTING_TOKEN_SUFFICIENT | `--color-info*` / brand primary |
| Destructive actions | EXISTING_TOKEN_SUFFICIENT | `--button-danger-*` / `--color-danger*` |

**Proposed additions (do not implement in this audit):** 0–2 optional editor component tokens (`--editor-editable-outline`, `--editor-chrome-bg`) only if Batch 5 finds repeated literals that do not map cleanly. Not required to start Batch 5.

| Metric | Value |
| --- | --- |
| `BATCH_5_READINESS` | **PASS** |

---

## 15. Recommended corrections (non-blocking)

Do **not** implement here. Deferred guidance:

1. **Batch 8:** Point `design-system.css` / `m3-modal.css` at V2.04 `--button-*` / `--color-*` / `--badge-*` instead of legacy `theme.css` (`--wf-primary`, `--flash-*`, `--btn-primary-*`).
2. **Batch 5–8:** Prefer `--badge-success|warning|neutral-*` over unused BB `--status-published|draft|inactive-*`; keep aliases until consumers exist or delete in cleanup.
3. **Batch 8:** Retire appearance compat aliases (`--bb-violet`, `--ac-teal`) after consumer migration.
4. **Optional:** Replace `--status-encounter-with-practitioner` bridge HEX with a named primitive (e.g. `--palette-violet-clinical-600`) if primitives expand — still product-domain mapped.
5. **Cleanup:** Remove single `--gp-ops-canvas` color consumer in `ac-app.css` in favor of `--color-background`.

None of the above block Batch 5.

---

## 16. Decision

Architecture after Batches 1–4 is healthy enough to propagate into website/editor surfaces:

- Count consistency PASS at 592  
- Product isolation PASS  
- Brand resolution via `data-product` / AC surface PASS  
- Completed-scope raw colors = 0  
- Domain tokens reviewed; duplication is alias-shaped, not conflicting  
- Editor concepts largely covered by existing semantic/component tokens  

**FINAL = READY_FOR_BATCH_5**

---

## Summary metrics

```
VERSION=2.04
BRANCH=V4
AUDIT=MID_MIGRATION_CROSS_PRODUCT

REPO_HARDCODED_COLORS=592
COUNT_CONSISTENCY=PASS

PRIMITIVE_TOKENS=44
PLATFORM_SEMANTIC_TOKENS=35
BRAND_TOKENS=7
COMPONENT_TOKENS=57
AC_DOMAIN_TOKENS=5
BB_DOMAIN_TOKENS=9
COMPATIBILITY_ALIASES=17

DOMAIN_TOKENS_REVIEWED=14
SEMANTIC_DUPLICATION_GROUPS=3
APPEARANCE_NAMED_TOKENS=4
OVERLY_SPECIFIC_TOKENS=0

UNDEFINED_TOKENS=25
CIRCULAR_REFERENCES=0
EXCESSIVE_ALIAS_CHAINS=1
DEPRECATED_ALIAS_CONSUMERS=1
DIRECT_PRIMITIVE_CONSUMERS=0

BB_TOKEN_LEAK_INTO_AC=0
AC_TOKEN_LEAK_INTO_BB=0
SHARED_COMPONENT_PRODUCT_COUPLING=0

ACCESSIBILITY=PASS
NEW_ACCESSIBILITY_RISKS=0

COMPLETED_SCOPE_RAW_COLORS=0
MISSED_COMPLETED_SCOPE_MIGRATIONS=0

BATCH_5_WEBSITE_EDITORS=170
BATCH_6_AC_PUBLIC=105
BATCH_7_BB_PUBLIC=150
BATCH_8_CLEANUP=149
OUT_OF_SCOPE_OR_JUSTIFIED=18
REMAINING_SCOPE_RECONCILIATION=PASS

BATCH_5_READINESS=PASS

REPORT=docs/qa/V2_04_COLOR_THEME_MID_MIGRATION_AUDIT.md
APPLICATION_CODE_CHANGED=NO
PRODUCTION=UNTOUCHED

FINAL=READY_FOR_BATCH_5
```
