# Platform ops UI ownership (PC09)

| Field | Value |
|-------|--------|
| **Doc ID** | `PLATFORM_OPS_UI_OWNERSHIP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC08 PASS |
| **Wholesale redesign** | **NONE** |
| **Production** | **NOT TOUCHED** |

Architecture guard: `tests/v10-pc09-platform-ops-ui-primitives.test.js`.

---

## 1. Platform owns (structural)

| Asset | Path |
|-------|------|
| Ops CSS (neutral defaults) | `public/platform/gp-ops-shared.css` |
| Fetch / CSRF helpers | `public/platform/gp-ops-fetch.js` → `window.GpOpsFetch` |
| Partials | `views/platform/partials/gp-ops-*.ejs` (table, filter-bar, pagination, status-badge, status-tabs, empty-state, card, timeline) |
| List query helpers | `src/platform/http/listQuery.js` |

Products override `--gp-ops-*` (AC via `ac-app-tokens.css`). BB does **not** mount `gp-ops-shared.css` until a deliberate BB adoption with Sacred Modernity token bridge.

---

## 2. Product owns (retained)

| Product | Retained |
|---------|----------|
| ActiveClinic | `ac-app.css`, `ac-app-tokens.css`, `ac-ops-queue` composition, drawers/modals, Stitch screen layouts, room status badges (`ac-badge--room-*`), patient/appointment filter grids |
| BlessBoard | `bb-ds-*` design system, HQ/branch/member shells, Sacred Modernity tokens, `bb-ds` tables/empty/pagination |

---

## 3. Migration rule

**On-touch / minimal only.** Prefer `gp-ops-*` when editing a list/queue. Do not rewrite Stitch-approved AC V2.03 compositions (patients, appointments, clinical workspace, Batch 3 stitch markers) solely for class purity.

Hybrid `ac-table gp-ops-table` is intentional during transition.
