# V2.03 Batch 1 + Batch 2 Shared Infrastructure Reconciliation

**Date:** 2026-09-26  
**Branch:** `V10`  
**Scope:** Minimum safe reconciliation of parallel Batch 1 / Batch 2 shared UI infrastructure.  
**Not in scope:** Redesign, broad CSS rewrite, Batch 2 screens AC-B2-06…10, production deploy.

---

## 1. Initial collision

Parallel Batch 1 (ODS `12134201997833374170`) and Batch 2 (`7300898757945019896`) work on `V10` contested:

| Collision | Symptom |
|-----------|---------|
| `public/activeclinic/ac-app.css` | Batch 2 frozen slate tokens (`#0F172A` / `#64748B` / `#E2E8F0`) vs uncommitted Batch 1 ODS retune (`#111827` / `#6B7280` / `#E5E7EB`) |
| Token systems | `:root` in `ac-app.css` + shared status in `ac-tokens.css` + gp-ops defaults |
| Staff shell | Batch 2 chrome structure + Batch 1 nav/parity edits in same CSS |
| Patients / appointment detail | Dual Stitch identities (ACN10/AC-B2-02, ACN08/AC-B2-05) with oscillating desktop IDs |
| `SHELL_ASSET_VERSION` | Interleaved bumps (`v2-03-mgmt-data-01`, dirty `v2-03-b1-parity-01`) |
| gp-ops vs AC primitives | Filter/table/badge/KPI patterns coexist |

**Pre-reconciliation HEAD:** `27d4021147c0e03fd3c724ea47081a1e1a00ef17` (ahead of `origin/V10` by 14). Uncommitted Batch 1 parity work preserved (billing/cashier Stitch IDs, services catalogue labels, shell/CSS retune).

---

## 2. Token decision

**Canonical authenticated staff tokens:** `public/activeclinic/ac-app-tokens.css`

| Choice | Rationale |
|--------|-----------|
| Prefer `ac-app-tokens.css` over rewriting `ac-tokens.css` | Least regression risk for public/portal teal (`--acp-*`) and shared shells |
| Palette values | ODS frozen V2.03 staff system (`#2563EB` / `#1D4ED8` / `#EFF6FF`, neutrals `#111827` / `#6B7280` / `#E5E7EB`, status `#16A34A` / `#D97706` / `#DC2626`) |
| Batch 2 Material HTML | Generator blues present; approximate slate `#0F172A` family normalized to ODS neutrals rather than maintaining dual sets |
| gp-ops | `--gp-ops-*` overrides set in the same file so ops primitives match staff brand |

`ac-app.css` no longer declares brand `:root` colours. `ac-tokens.css` remains for public/portal + shared semantic layers; staff shell loads `ac-app-tokens.css` after it so authenticated overrides win.

### Canonical values

| Token | Value |
|-------|-------|
| `--ac-primary` | `#2563eb` |
| `--ac-primary-dark` / `--ac-primary-2` | `#1d4ed8` |
| `--ac-primary-light` / `--ac-primary-soft` | `#eff6ff` |
| `--ac-text-primary` / `--ac-ink` | `#111827` |
| `--ac-text-secondary` / `--ac-muted` | `#6b7280` |
| `--ac-border` | `#e5e7eb` |
| `--ac-surface` | `#ffffff` |
| `--ac-background` / `--ac-bg` | `#f8fafc` |
| `--ac-success` | `#16a34a` |
| `--ac-warning` | `#d97706` |
| `--ac-danger` | `#dc2626` |
| `--ac-info` | `#2563eb` |
| `--ac-disabled` | `#9ca3af` |

---

## 3. Shell ownership

**Canonical ActiveClinic shared staff shell = Batch 2 implementation**, with Batch 1 navigation/permissions/module visibility preserved.

| Asset | Owner |
|-------|-------|
| `views/activeclinic/layouts/app-shell.ejs` | Shared (loads gp-ops → ac-tokens → **ac-app-tokens** → ac-app) |
| `sidebar.ejs`, mobile bottom nav, ops tools, `ac-shell-nav.js` | Shared B2 structure |
| `buildActiveClinicShellViewModel.js` | Shared; `SHELL_ASSET_VERSION = v2-03-shared-01` |
| Active nav styling | Canonical tokens (`--ac-teal` active state from Batch 1 parity) |

Desktop: 256px sidebar / 56px topbar. Mobile: 56px top / 64px bottom nav.

---

## 4. Platform component ownership

| Prefer gp-ops | Keep AC-specific |
|---------------|------------------|
| Filter bar (where already used), table/pagination partials, status badge, timeline, empty state, generic ops cards | `.ac-btn` / staff controls, clinical encounter UI, consent ledger, follow-up, billing/receipt domain, staff shell, AC navigation, workflow widgets |

**This pass:** No sweeping conversion of every screen. Patients and appointment detail already consume `gp-ops-pagination`, `gp-ops-status-badge`, and `gp-ops-timeline` where appropriate. Remaining `.ac-table` / `.ac-badge` / `.ac-filter-bar` / `.ac-stat-card` duplication in `ac-app.css` is **intentional technical debt** for a later low-risk migration.

---

## 5. Patient reconciliation

| Item | Decision |
|------|----------|
| Route | One: `GET /app/patients` |
| Functionality | Batch 1 ACN10 (directory, duplicates, RBAC, consent linkage) |
| Visual target | Batch 2 AC-B2-02 Stitch IDs (`04c24f7d…` / `ccb2201f…`) |
| Markers | `data-ac-stitch="AC-B2-02"` + `data-ac-batch1="ACN10"` |
| ODS IDs | Retained as `listDesktopOds` / `listMobileOds` reference only |
| AC-B2-03 | Still absent in Stitch; ACN11 profile remains functional |

---

## 6. Appointment detail reconciliation

| Item | Decision |
|------|----------|
| Route | One: `GET /app/appointments/:id` |
| Functionality | Batch 1 ACN08 lifecycle, status POSTs, RBAC |
| Visual target | Batch 2 AC-B2-05 (`abc9994a…` / `2621d934…`) |
| Markers | `data-ac-stitch="AC-B2-05"` + `data-ac-batch1="ACN08"` |
| ODS desktop | `detailDesktopOds` reference only |

---

## 7. CSS debt retained intentionally

- Screen-scoped packs: `.ac-batch1a*`, `.ac-dashboard--b2`, `.ac-patients--b2`, `.ac-appointments--b2`, `.ac-appointment-detail--b2`
- Legacy `.ac-table` / `.ac-badge` / `.ac-filter-bar` / `.ac-stat-card` alongside gp-ops
- Monolithic `ac-app.css` (~3510 lines) — stop dumping new brand tokens here; extract screen packs later when a batch owns a surface
- Public `ac-tokens.css` status hexes differ from staff ODS until a future public-only cleanup (staff overridden by `ac-app-tokens.css`)

---

## 8. Files changed (reconciliation + preserved Batch 1 parity)

| Path | Role |
|------|------|
| `public/activeclinic/ac-app-tokens.css` | **New** canonical authenticated tokens |
| `public/activeclinic/ac-app.css` | Strip `:root` brand dump; keep B1 nav/badge parity |
| `public/activeclinic/ac-tokens.css` | Comment: staff tokens → ac-app-tokens |
| `views/activeclinic/layouts/app-shell.ejs` | Load ac-app-tokens |
| `src/activeclinic/services/buildActiveClinicShellViewModel.js` | `v2-03-shared-01` |
| `src/activeclinic/services/loadActiveClinicPatientScreens.js` | B2 visual IDs + ODS refs |
| `src/activeclinic/services/loadActiveClinicAppointmentScreens.js` | B2 visual IDs + ODS ref |
| `src/activeclinic/http/activeClinicBillingRoutes.js` | B1 ODS Stitch IDs (parity) |
| `src/activeclinic/http/activeClinicCashierRoutes.js` | B1 ODS Stitch IDs (parity) |
| `views/activeclinic/app/services-catalogue-content.ejs` | B1 ODS label/ID parity |
| `tests/activeclinic-batch1a-*.js` / `tests/activeclinic-batch2-shell.test.js` | Assert reconciled tokens/IDs |
| `docs/qa/V2_03_BATCH1_BATCH2_SHARED_RECONCILIATION.md` | This document |

Related Batch 1 docs kept alongside (not production): `docs/qa/V2_03_AC_BATCH1_FINAL_QA.md`, `docs/v2.03/AC_BATCH1_STITCH_PARITY.md`, `docs/qa/V2_03_BATCH2_PARALLEL_IMPLEMENTATION_CHECKPOINT.md`.

---

## 9. Tests

| Suite | Result |
|-------|--------|
| Batch 1a (config, appointments, patient-reception, clinical, billing, management-data) | **28/28 pass** |
| Batch 2 (shell, dashboard, patient-workspace, appointments-workspace) | **14/14 pass** |
| `activeclinic-navigation-rbac` | **7/7 pass** |

Assertions for superseded visual metadata (ODS desktop IDs on overlapping patients/detail) updated to B2 visual targets; functional Batch 1 markers retained. No assertion weakening for behaviour/RBAC.

---

## 10. Remaining risks

1. **Public vs staff status colours** — `ac-tokens.css` still ships older success/warning/danger hexes; staff pages override via `ac-app-tokens.css`. Public marketing/auth intentionally unchanged.
2. **CSS monolith** — further Batch 2 screens (AC-B2-06…) must not re-add `:root` brand blocks into `ac-app.css`.
3. **gp-ops / AC dual primitives** — visual drift possible until gradual migration.
4. **Hosted deploy lag** — reconciliation is local-only; production not touched.
5. **Teal active-nav** — Batch 1 parity choice; confirm against frozen B2 chrome if product wants primary-blue active states instead.

---

## 11. Rules for future Batch implementation

1. **One authenticated token file** — edit `ac-app-tokens.css` only; never fork B1/B2 palettes in screen CSS.
2. **One staff shell** — extend Batch 2 shell + Batch 1 nav entries; do not invent a second layout.
3. **Overlapping operational surfaces** — Batch functionality + later Batch visual Stitch IDs = one route/view/loader.
4. **Bump `SHELL_ASSET_VERSION`** only when shared CSS/JS changes (`v2-03-shared-NN`). Screen-only backend/data work must not thrash it.
5. **Prefer gp-ops** for filter/table/badge/pagination/timeline/empty on newly touched surfaces; keep AC domain widgets product-specific.
6. **Do not dump screen packs into token files** — temporary `.ac-*--b2` / `.ac-batch1a*` selectors stay in `ac-app.css` until extracted under that batch’s ownership.
7. **No parallel Stitch identity ownership** — primary `data-ac-stitch` = visual authority; `data-ac-batch1` (or equivalent) = functional lineage.

---

## Asset version policy

`SHELL_ASSET_VERSION = "v2-03-shared-01"`  
Subsequent shared CSS/JS changes → `v2-03-shared-02`, etc.

**PRODUCTION TOUCHED:** NO  
**PUSH:** NO (local commit only when tests pass)
