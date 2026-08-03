# ActiveClinic Navigation Model

**Stage:** AC-V6-10

## Source of truth

`src/activeclinic/services/activeClinicNavigation.js`

Desktop and mobile navigation are built from the **same** filtered item list.

## Rules

- Filter by resolved permission keys only (never role-name allowlists)
- Hide unauthorized items (do not show disabled stubs)
- Direct route access still enforces permissions via middleware
- Active route uses `aria-current="page"` and `.is-active`
- Future module groups can extend the registry without a shell rewrite

## Initial items

| Key | Route | Permission |
|-----|-------|------------|
| home | `/app` | `activeclinic.access` |
| facilities | `/app/facilities` | `activeclinic.facility.view` |
| staff | `/app/staff` | `activeclinic.staff.view` |
| access | `/app/access` | `activeclinic.staff.assign_access` |
| settings | `/app/settings` | `activeclinic.organization.manage` |

Clinical Stitch modules are intentionally omitted until their backend phases are approved.
