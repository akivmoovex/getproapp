# V10 PC09 — Platform Ops UI Primitives

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC09_PLATFORM_OPS_UI_PRIMITIVES` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC08 PASS |
| **Verdict** | **`PLATFORM_OPS_UI_PRIMITIVES_PASS`** |
| **Deploy / production** | **NOT TOUCHED** |
| **Wholesale redesign** | **NONE** |

Ownership: [`docs/platform/PLATFORM_OPS_UI_OWNERSHIP.md`](../platform/PLATFORM_OPS_UI_OWNERSHIP.md).

---

## 1. Goal

Reduce generic UI duplication without merging BlessBoard and ActiveClinic visual identities. Prefer existing `gp-ops-*` for tables, filters, pagination, badges, empty states, list controls, and shared fetch/CSRF helpers — **on-touch / minimal** only.

---

## 2. Shared primitives adopted / extended

| Primitive | Status |
|-----------|--------|
| `gp-ops-shared.css` | Retained product-neutral defaults; AC overrides via `ac-app-tokens.css` |
| `gp-ops-*` partials (table, filter-bar, pagination, status-badge, status-tabs, empty-state, card, timeline) | Inventory confirmed; already used by AC B2 queues |
| **`gp-ops-fetch.js`** (new) | CSRF + `fetchJson` / `appendCsrf` → `window.GpOpsFetch` |
| Website media field | Adopts `GpOpsFetch` with local CSRF fallback |
| AC rooms list (ACN27) | On-touch hybrid `ac-table gp-ops-table` + scroll wrap (filter/empty already gp-ops) |
| AC pharmacy low-stock | On-touch `gp-ops-empty-state` + hybrid `gp-ops-table` |

Shell wiring: AC `app-shell` always loads `gp-ops-fetch` before media-field; BB HQ/branch shells load it only when `loadSharedWebsiteMedia` is set (no `gp-ops-shared.css` on BB).

---

## 3. Intentionally retained product CSS / chrome

| Retained | Why |
|----------|-----|
| BlessBoard `bb-ds-*` + shells | Sacred Modernity / Stitch church identity — **not** migrated to gp-ops |
| AC `ac-app.css` / `ac-app-tokens.css` / `ac-ops-queue` | Product composition + token bridge |
| AC drawers / healthcare modals | Domain UX; no platform mega-modal |
| Patient / appointment `ac-filter-bar__grid--*` | Stitch-approved filter compositions |
| Room status `ac-badge--room-*` | AC domain badge tones |
| Hybrid `ac-table gp-ops-table` on queues | Transition pattern; not forced purity |

**Not done:** wholesale screen redesign; BB adopting AC tokens; AC adopting BB violet; changing Stitch-approved V2.03 layouts beyond hybrid table chrome on rooms/low-stock.

---

## 4. Tests (gate)

```text
tests/v10-pc09-platform-ops-ui-primitives.test.js
tests/v2-03-platform-shared-foundation.test.js
tests/activeclinic-batch2-shell.test.js
tests/activeclinic-batch2-operational-queues.test.js
tests/activeclinic-batch3-acn27-rooms.test.js
```

**Result:** **32 / 32 PASS**.

Pre-existing drifts (out of PC09 scope): `v2-shared-media-upload-parity` string/cache-bust; `blessboard-v5-frontend-assets` media-picker gate regex vs `loadSharedWebsiteMedia` include objects.

---

## 5. Screenshots / manual QA still required

Browser visual checks (not run in this pass):

1. AC staff shell — pharmacy queue, diagnostics queues, facilities, rooms list (desktop + 390px).
2. AC pharmacy low-stock empty + populated table.
3. AC patients / appointments — confirm Stitch filter grids unchanged.
4. BB HQ branding / content admin with shared media field — CSRF upload still works with `gp-ops-fetch`.
5. Confirm BB shells still have **no** `gp-ops-shared.css` / AC token leakage.

---

## 6. Verdict

```text
PLATFORM_OPS_UI_PRIMITIVES_PASS
```
