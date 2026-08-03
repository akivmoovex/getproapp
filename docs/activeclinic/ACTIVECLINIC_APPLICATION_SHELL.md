# ActiveClinic Application Shell

**Stage:** AC-V6-10  
**Branch:** V6  
**Status:** Foundational complete

## Architecture

One canonical authenticated shell for all ActiveClinic staff roles:

- Skip link → desktop sidebar → mobile header/drawer → page header → breadcrumbs → flash → main content → account menu

Differences between network admin, facility admin, and staff come from **permission-filtered navigation**, not duplicated layouts.

## Templates & assets

| Path | Role |
|------|------|
| `views/activeclinic/layouts/app-shell.ejs` | Shell chrome |
| `views/activeclinic/partials/sidebar.ejs` | Desktop + drawer nav |
| `views/activeclinic/app/*-content.ejs` | Page bodies |
| `public/activeclinic/ac-app.css` | Tokens + layout |
| `public/activeclinic/ac-shell-nav.js` | Mobile drawer a11y |

BlessBoard EJS/CSS are **not** imported.

## Route map

| Route | Permission |
|-------|------------|
| `GET /app` | `activeclinic.access` |
| `GET /app/facilities` | `activeclinic.facility.view` |
| `GET /app/facilities/:facilityKey` | `activeclinic.facility.view` |
| `GET /app/staff` | `activeclinic.staff.view` |
| `GET /app/access` | `activeclinic.staff.assign_access` |
| `GET /app/settings` | `activeclinic.organization.manage` |
| `GET/POST /app/select-facility` | authenticated |
| `GET/POST /app/select-organization` | authenticated |

## Session-expired behaviour

Invalid ActiveClinic session → clear `activeclinic_org_sid` (+ CSRF cookie) → safe message → `/login`. BlessBoard cookies untouched.

## Known limitations

- Not Stitch-final visual parity
- Access page is read-only foundation copy
- No clinical modules

See also: [ACTIVECLINIC_NAVIGATION_MODEL.md](./ACTIVECLINIC_NAVIGATION_MODEL.md), [ACTIVECLINIC_ORGANIZATION_FACILITY_CONTEXT.md](./ACTIVECLINIC_ORGANIZATION_FACILITY_CONTEXT.md), [ACTIVECLINIC_UI_FOUNDATION.md](./ACTIVECLINIC_UI_FOUNDATION.md).
