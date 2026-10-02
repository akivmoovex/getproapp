# AC-V6-S03 — Facilities Management Stitch Parity

**Stage:** AC-V6-S03  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_S03_FACILITIES_PARTIAL`

No ActiveClinic Stitch screens exist for facilities management (inventory **STITCH_GAP**). Implementation is **functional / shell design-system** UI on the AC-V6-S02 shell. Visual parity is **VISUAL_BLOCKED** — do not claim Stitch MATCHED.

---

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Route | Status |
|---|---|---|---|---|
| *(none — Facilities list)* | — | Desktop | `GET /app/facilities` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Facilities list mobile)* | — | Mobile | same URL | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Facilities empty)* | — | D/M | same URL | **VISUAL_BLOCKED** / functional COMPLETE (none / filtered / restricted) |
| *(none — Facility detail)* | — | Desktop | `GET /app/facilities/:facilityKey` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Facility detail mobile)* | — | Mobile | same URL | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Create facility)* | — | D/M | `GET/POST /app/facilities/new`, `POST /app/facilities` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Edit facility)* | — | D/M | `GET …/edit`, `POST …/:facilityKey` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Archive confirm)* | — | D/M | detail `details` + `POST …/archive` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Set primary)* | — | D/M | `POST …/set-primary` | **VISUAL_BLOCKED** / functional COMPLETE |

Product: ActiveClinic Stitch `projects/12272131183982732110` only.

---

## Routes and permissions

| Route | Permission |
|---|---|
| `GET /app/facilities` | `activeclinic.facility.view` |
| `GET /app/facilities/new` | `activeclinic.facility.create` |
| `POST /app/facilities` | `activeclinic.facility.create` + CSRF |
| `GET /app/facilities/:facilityKey` | `activeclinic.facility.view` (+ assignment scope if no create) |
| `GET /app/facilities/:facilityKey/edit` | `activeclinic.facility.update` |
| `POST /app/facilities/:facilityKey` | `activeclinic.facility.update` + CSRF |
| `POST /app/facilities/:facilityKey/set-primary` | `activeclinic.facility.update` + CSRF |
| `POST /app/facilities/:facilityKey/archive` | `activeclinic.facility.archive` + CSRF + confirm |

Scope: organization from session; facility key lookups always include `organization_id`. Catalogue vs assignment: users **without** `facility.create` see only actively assigned facilities.

---

## Loaders and services

| Loader | File |
|---|---|
| `loadActiveClinicFacilitiesListScreen` | `src/activeclinic/services/loadActiveClinicFacilityScreens.js` |
| `loadActiveClinicFacilityDetailScreen` | same |
| `loadActiveClinicCreateFacilityScreen` | same |
| `loadActiveClinicEditFacilityScreen` | same |
| `parseFacilityFormBody` | same |

| Write | Service |
|---|---|
| create / update / archive / setPrimary | `facilityService.js` (audit events emitted) |

Routes: `src/activeclinic/http/activeClinicFacilityRoutes.js` registered from `activeClinicFoundationServer.js`.

---

## Filters / search

Allowlisted query params: `q` (name/key/city/province), `type`, `status`, `primary=1`.  
Invalid enums ignored. Sort: display name. No SQL sort expressions. No pagination (org facility counts expected small).

---

## Facility key

- Suggested from display name on create (`suggestFacilityKeyFromDisplayName`)
- Reserved keys rejected (`new`, `edit`, …)
- Immutable after create (edit shows read-only key)

---

## Intentional differences / gaps

- **VISUAL_BLOCKED:** no Stitch facility designs — UI uses shell tokens, not invented Stitch layouts
- No patient / appointment / clinical / revenue fields
- No departments, wards, beds, operating hours
- Pagination deferred
- Sticky save bar not used (not mapped)
- Focus trap for `<details>` archive confirm is native disclosure (not modal dialog)

---

## Accessibility

- One H1 via shell page header
- Search/filter labels; table headers on desktop; mobile cards with type/status text
- Form labels, `inputmode=tel`, email autocomplete
- Validation summary `#ac-facility-error-summary` focused on error re-render
- Status badges include text (not color-only)

---

## Tests

`tests/activeclinic-facilities-parity.test.js` — list/detail/create/edit/primary/archive, CSRF, permissions, tenant isolation, empty modes, markers, no BlessBoard branding.

---

## Gate for AC-V6-S04

**OPEN** for Staff List / Detail (or Roles and Access) utilitarian wave — facilities functional family is in place; Stitch visual rematch only if facility screens are later added to the ActiveClinic Stitch project.
