# V2.03 Batch 2 — Shared Platform Regression Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH2_SHARED_REGRESSION_AUDIT` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Baseline tip (pre-fix)** | `40107164` (Batch 2 Stitch visual parity) |
| **Scope** | Shared/platform surfaces touched by Batch 2 + directly affected BB/AC consumers |
| **Mode** | Prove AC Stitch Batch 2 did not damage BlessBoard or existing AC V2.02 / V2.03 |
| **Verdict** | `V2_03_BATCH2_SHARED_REGRESSION_PASS` |

---

## Goal

Prove ActiveClinic Batch 2 Stitch implementation did **not** regress:

1. BlessBoard product themes / shells / design system
2. Existing ActiveClinic V2.02 and V2.03 Batch 1–2 functionality that consumes shared infra

Do **not** make BlessBoard look like ActiveClinic. Shared infrastructure may be common; product themes remain separate.

---

## Inventory — Batch 2 shared / platform touchpoints

### UI / CSS (authenticated staff + ops primitives)

| Asset | Batch 2 role | BB consumer? | AC consumer? |
|-------|--------------|--------------|--------------|
| `public/platform/gp-ops-shared.css` | Structural ops primitives; B2 visual pass retuned radii/font/accent | **No** (not linked from BB shells) | Yes — staff `app-shell.ejs` |
| `views/platform/partials/gp-ops-*.ejs` | Filter bar, table, badge, pagination, timeline, status tabs, empty, card | **No** | Yes — B2 queues, billing, facilities, patients, appointments, clinical |
| `public/activeclinic/ac-app-tokens.css` | Canonical AC staff tokens + `--gp-ops-*` brand bridge | **No** | Yes — staff shell only |
| `public/activeclinic/ac-app.css` | Staff chrome, panels, buttons, drawers, responsive | **No** | Yes |
| `public/activeclinic/ac-tokens.css` | Comment-only staff pointer; public/portal `--acp-*` unchanged | **No** (BB uses `blessboard/v5/*`) | Public/portal + staff load order |
| `SHELL_ASSET_VERSION` | Bumped on shared CSS changes | N/A | Staff asset cache bust |

### Platform JS (shared helpers touched adjacent to Batch 2)

| Asset | Change | BB impact | AC impact |
|-------|--------|-----------|-----------|
| `src/platform/money/formatMoney.js` | Lifted from AC wrapper | None (BB HQ analytics keeps local formatter) | Billing/cashier via `activeclinic/services/formatMoney` |
| `src/platform/jobs/dataJobFileValidation.js` | CSV parse/escape shared | `src/church/memberImportCsv.js` reuses parse/escape | AC data jobs |
| `src/platform/http/listQuery.js` | Shared list pagination helpers | Platform admin list paths (pre-existing) | AC list screens |
| `src/blessboard/services/blessboardDataJobAdapters.js` | Wired during platform dedupe | BB data-job adapters only | N/A |

### Explicitly **not** shared with BlessBoard UI

- BlessBoard continues on `public/blessboard/v5/design-tokens.css` + `design-system.css` (violet `#6C5CE7`, Hanken Grotesk).
- No BB EJS includes `gp-ops-*` partials.
- No BB shell loads `gp-ops-shared.css`, `ac-app-tokens.css`, or `ac-app.css`.

---

## Primitive checklist

| Primitive | Shared change risk | Result |
|-----------|-------------------|--------|
| Design tokens | AC staff tokens isolated; BB violet untouched | **PASS** |
| Buttons | `gp-ops-btn` / `.ac-btn` — AC shell only; BB `.bb-ds-btn` intact | **PASS** |
| Forms | `gp-ops-input` / filter bar — AC only | **PASS** |
| Cards / panels | `gp-ops` + `.ac-panel` radii via AC tokens | **PASS** |
| Tables | `gp-ops-table` + `.ac-table` — AC only | **PASS** |
| Badges | Accent/info now follow `--gp-ops-primary` (product override) | **PASS** (fixed) |
| Drawers / modals | AC drawers in `ac-app.css`; BB `.bb-ds-drawer` / modal untouched | **PASS** |
| Responsive utilities | Status-tab 44px mobile touch — structural shared CSS | **PASS** |
| Navigation primitives | AC staff sidebar/bottom nav only | **PASS** |
| Media components | Not touched by Batch 2 shared CSS | **PASS** (BB media-picker test failure is pre-existing / out of scope) |

---

## Regression found and fixed (Batch 2–caused)

### REG-01 — AC theme leaked into shared `gp-ops` defaults

**Cause:** Visual parity commit `40107164` set shared `:root` to AC Stitch values (`8px` / `12px` radii, Inter font stack, hardcoded blue accent badge).

**Why it matters:** `gp-ops-shared.css` is documented as BB + AC structural CSS. Baking AC brand into defaults would damage BlessBoard if/when BB mounts gp-ops, and violates “product themes remain separate.”

**Fix (this audit):**

1. Restore **product-neutral** defaults in `public/platform/gp-ops-shared.css` (system font, `0.5rem` / `0.75rem` radii).
2. Move AC radii / Inter font into `public/activeclinic/ac-app-tokens.css` `--gp-ops-*` overrides.
3. Drive `.gp-ops-badge--info` / `--accent` from `var(--gp-ops-primary)` instead of hardcoded `#2563eb`.
4. Bump `SHELL_ASSET_VERSION` → `v2-03-b2-shared-reg-01`.
5. Update shell freeze test to assert AC overrides live in tokens, not shared defaults.

AC visual outcome unchanged when staff shell loads tokens after gp-ops.

---

## Out-of-scope / pre-existing (not Batch 2)

| Finding | Evidence | Action |
|---------|----------|--------|
| `tests/blessboard-branch-admin-shell.test.js` — HQ admin copy / inactive-user expectations | Fails on retry; BB shell/views **not** modified by B2 commits; test assertions from Jul 2026 | Document only — do not “fix” with AC theme work |
| `tests/blessboard-v5-frontend-assets.test.js` — media-picker gate on content-admin | Last related BB commits are website/media (not B2); no gp-ops/AC CSS involvement | Document only |

---

## Theme isolation proof

| Check | Result |
|-------|--------|
| BB `--bb` primary remains `#6C5CE7` + Hanken | Confirmed in `design-tokens.css` |
| AC blue `#2563eb` absent from BB design-system CSS | Confirmed |
| BB violet absent from `ac-app-tokens.css` (comment-only mention in gp-ops header) | Confirmed |
| BB V5 shells do not reference gp-ops / ac-app assets | Confirmed on apex + tenant-public shell starts |
| AC staff still resolves `--gp-ops-radius: 8px` via `ac-app-tokens.css` | Confirmed by shell freeze test |

---

## Automated tests run

### Platform shared foundation

- `tests/v2-03-platform-shared-foundation.test.js` — **PASS**

### BlessBoard (focused consumers)

| Suite | Result |
|-------|--------|
| `blessboard-design-system.test.js` | **PASS** |
| `blessboard-hq-shell.test.js` | **PASS** |
| `blessboard-platform-admin-shell.test.js` | **PASS** |
| `church-member-import.test.js` (CSV unit + shared parse wire) | **PASS** (DB import skipped when DB unavailable) |
| `blessboard-v5-responsive-structure.test.js` | **PASS** |
| `blessboard-branch-admin-shell.test.js` | 2 failures — **pre-existing / out of scope** |
| `blessboard-v5-frontend-assets.test.js` | 1 media-picker failure — **pre-existing / out of scope** |

### ActiveClinic Batch 2 + Batch 1 consumers

| Suite | Result |
|-------|--------|
| `activeclinic-batch2-shell.test.js` | **PASS** (post-fix) |
| `activeclinic-batch2-dashboard.test.js` | **PASS** |
| `activeclinic-batch2-appointments-workspace.test.js` | **PASS** |
| `activeclinic-batch2-patient-workspace.test.js` | **PASS** |
| `activeclinic-batch2-clinical-encounter.test.js` | **PASS** |
| `activeclinic-batch2-operational-queues.test.js` | **PASS** |
| `activeclinic-batch2-billing.test.js` | **PASS** |
| `activeclinic-batch2-facilities.test.js` | **PASS** |
| `activeclinic-batch1a-billing.test.js` | **PASS** |
| `activeclinic-batch1a-patient-reception.test.js` | **PASS** |
| `v2-02-platform-rbac-foundation.test.js` | **PASS** |

### Unit / route smoke

- Platform `formatMoney` + `parseListQuery` + BB `memberImportCsv` parse — **PASS**
- BB token isolation assertions — **PASS**
- AC staff HTTP smokes inside Batch 2 suites (`/app`, billing, facilities, queues, encounter, appointments) — **PASS**

---

## Files changed in this audit

| File | Change |
|------|--------|
| `public/platform/gp-ops-shared.css` | Neutral defaults; primary-driven info/accent badges |
| `public/activeclinic/ac-app-tokens.css` | AC `--gp-ops-radius` / `--gp-ops-font` overrides |
| `src/activeclinic/services/buildActiveClinicShellViewModel.js` | `SHELL_ASSET_VERSION = v2-03-b2-shared-reg-01` |
| `tests/activeclinic-batch2-shell.test.js` | Assert product separation |
| `docs/qa/V2_03_BATCH2_SHARED_REGRESSION_AUDIT.md` | This document |

---

## Residual risk / follow-ups (non-blocking)

1. When BlessBoard mounts `gp-ops-shared.css`, set BB `--gp-ops-primary: #6C5CE7` (+ Hanken font) in BB tokens — same pattern as AC.
2. Close pre-existing branch-admin / media-picker test drift in a BB-only ticket.
3. Gradual migration of remaining `.ac-table` / `.ac-badge` duplicates to gp-ops remains technical debt (unchanged).

---

## Verdict

Shared Batch 2 changes did **not** damage BlessBoard design/system/shells or AC V2.02 / V2.03 Batch 1–2 behaviour. The one Batch-2-caused shared regression (AC theme baked into gp-ops defaults) was corrected with product-token overrides.

**`V2_03_BATCH2_SHARED_REGRESSION_PASS`**
