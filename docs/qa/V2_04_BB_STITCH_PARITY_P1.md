# V2.04 BlessBoard — Stitch Parity P1 (Visual Foundation)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_STITCH_PARITY_P1` |
| **Branch** | `V4` |
| **Date** | 2026-10-01 |
| **Mode** | Visual foundation only (no business/route/service/DB/RBAC changes) |
| **Stitch** | [BlessBoard Member Design Foundation](https://stitch.withgoogle.com/projects/12773983203917549893) · Sanctuary Modern DS |
| **Prior** | `docs/qa/V2_04_BB_STITCH_RECONCILIATION.md` |
| **Finish** | **`V2_04_BB_STITCH_P1_VISUAL_FOUNDATION_PASS`** |

---

## Objective result

Cross-cutting BlessBoard **ops** surfaces now resolve Stitch **Sanctuary Modern** tokens (Grace Royal Blue `#2563EB`, navy rail, slate canvas, Plus Jakarta / Inter / JetBrains Mono) via BB-scoped mapping.

**Apex marketing** retains Sacred Modernity violet `#6C5CE7` + Hanken (unchanged).

**ActiveClinic** tokens untouched (same blue primitives reused only through AC staff / BB ops selectors independently).

Screen-level parity is **not** claimed — remaining major/minor/mobile gap ID lists from reconciliation still apply for later phases.

---

## Audit summary

| Source | Finding |
|--------|---------|
| Stitch DS §4.1 | `brand-primary #2563EB`, `brand-navy #1E293B`, `bg-app #F8FAFC`, slate borders/text |
| Prior V4 BB ops | Violet Sacred Modernity via `[data-product="blessboard"]` |
| Platform | Semantic `--color-brand-*` + `--button-*` / `--card-*` / `--badge-*` already exist |
| Decision | **Do not** retokenize global BB product violet; add **F2 ops shell** override |

---

## Changes

### FILES_CHANGED

```
src/platform/ui/theme/colors.css
public/platform/theme/colors.css
public/blessboard/v5/design-tokens.css
public/blessboard/v5/v204-foundation.css          (new)
public/blessboard/v5/branch-admin.css             (V2.04 hardcodes → tokens)
public/blessboard/v5/member-auth.css
views/blessboard/v5/partials/head-design-system.ejs
views/blessboard/v5/partials/branch-admin-shell-start.ejs
views/blessboard/v5/partials/member-shell-start.ejs
views/blessboard/v5/member-auth/_shell-start.ejs  (+ data-product)
tests/v2-04-product-token-cascade.test.js
tests/v2-04-bb-stitch-parity-audit.test.js
tests/v2-04-bb-shared-ui-primitives.test.js
tests/v2-04-bb-request-admin.test.js
docs/qa/V2_04_BB_STITCH_PARITY_P1.md              (this file)
```

### TOKENS_REUSED

- `--palette-blue-600` / `--palette-blue-700` / `--palette-blue-50` (existing; also AC staff)
- `--palette-slate-50`, `--palette-white`, platform `--color-*` / `--button-*` / `--card-*` / `--badge-*` / `--input-*` / `--table-*` / `--modal-*`
- `--bb-color-*` aliases (still bridge to `--color-brand-*`)
- `--gp-ops-*` compatibility aliases (product-neutral; ops shells rebind to Sanctuary)

### TOKENS_ADDED

Primitives (shared palette, not AC product CSS):

- `--palette-ink-920` (`#0f172a`)
- `--palette-navy-700` (`#1e293b`)
- `--palette-slate-125` / `175` / `250` / `450` / `550`
- `--palette-amber-600` (`#d97706` brand-gold)

BB ops aliases:

- `--bb-color-navy`, `--bb-color-gold`
- `--bb-radius-lg`, `--bb-font-body`, `--bb-font-mono` (ops)

Platform sections **F2** + **I2**: Sanctuary Modern brand + nav/button rebind for  
`data-bb-shell` ∈ `{branch-admin,hq-admin,member,member-auth,platform-admin}`.

### HARDCODED_COLORS_REMOVED

| Location | Removed / replaced |
|----------|--------------------|
| `branch-admin.css` V2.04 blocks | `#6c5ce7` fallbacks, `#111`, `#1f9d63`, `#f0a500` → `--bb-color-*` / semantic |
| `member-auth.css` | `#6c5ce7` primary fallback → `--button-primary-bg` |

### SHARED_COMPONENTS_CHANGED

| Component | Change |
|-----------|--------|
| gp-ops (via ops token rebind) | Primary/buttons/fields/banners inherit Sanctuary brand |
| `v204-foundation.css` | Shared parity for headers, cards, buttons, fields, chips, tables, search, filters, warnings, empty/success, dialogs, nav rail, Church ID mono, mobile touch heights |
| BB `v204/*` wrappers | Unchanged structure; consume remapped tokens |
| Design-system head | Loads Plus Jakarta + JetBrains Mono + `v204-foundation.css` |

### AC_IMPACT

**None.** AC public teal / staff blue selectors unchanged. BB ops and AC staff independently map `--palette-blue-600`; no AC CSS edited.

---

## Tests

| Suite | Result |
|-------|--------|
| Member feature `node --test` (18 files) | **179 pass / 0 fail / 0 skip** |
| `npm run test:architecture` | **7 pass / 0 fail / 0 skip** |
| **Combined** | **186 pass / 0 fail / 0 skip** |

Note: prior gate **184** = 177 + 7. P1 added **2** guards (ops blue cascade + foundation CSS) → **179 + 7 = 186**. Functional behaviour unchanged.

### Reported metrics

| Metric | Value |
|--------|------:|
| **TEST_CASES** | **186** |
| **PASS** | **186** |
| **FAIL** | **0** |
| **SKIP** | **0** |

---

## Remaining parity (not closed by P1)

Theme foundation does **not** equal per-screen Stitch parity. Carry-forward from reconciliation:

```
PARITY_MAJOR_GAP_IDS=
BB-M13,BB-M14,BB-M15,BB-M16,BB-M17,BB-M18,BB-M19,BB-M20,BB-M21,BB-M22,BB-M23,BB-M24,BB-M25,BB-M26,BB-M27,
BB-A05,BB-A06,BB-A07

PARITY_MINOR_GAP_IDS=
BB-M01,BB-M02,BB-M03,BB-M04,BB-M05,BB-M06,BB-M07,BB-M08,BB-M09,BB-M10,BB-M11,BB-M12,
BB-A01,BB-A02,BB-A03,BB-A04,BB-A08,BB-A09,BB-A10,BB-A11,BB-A12,BB-A13,BB-A14,
BB-R01,BB-R02,BB-R03,BB-R04

MOBILE_GAP_IDS=
BB-M13,BB-M14,BB-M15,BB-M16,BB-M17,BB-M18,BB-M19,BB-M20,BB-M21,BB-M22,BB-M23,BB-M24,BB-M25,BB-M26,BB-M27,
BB-A06,BB-A07
```

Next phases: targeted screen/mobile parity against Stitch frames/suites, still without business-rule changes.

---

## Finish

```
V2_04_BB_STITCH_P1_VISUAL_FOUNDATION_PASS
```
