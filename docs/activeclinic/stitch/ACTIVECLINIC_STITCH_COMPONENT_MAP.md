# ActiveClinic Stitch — Component Map (Phases 1–7)

**Audited:** 2026-08-04

| Pattern | Shared component / file | Used by |
|---------|-------------------------|---------|
| Auth shell | `views/activeclinic/layouts/auth-shell.ejs`, `public/activeclinic/ac-auth.css` | P01 login + lifecycle |
| App shell | `views/activeclinic/layouts/app-shell.ejs`, `public/activeclinic/ac-app.css` | All `/app/*` |
| Nav icons / drawer | `partials/nav-icon.ejs`, `ac-shell-nav.js` | P01 shell/drawer |
| Inline empty/error | `partials/ac-inline-state.ejs` | Lists / forms |
| Access denied | `app/access-state.ejs` | Permission middleware |
| Patient list/form/profile/success | `app/patient-*-content.ejs` | P02 |
| Facility/staff badges | `partials/*-badges.ejs` | Admin screens (non-P01–P07 Stitch) |

Design tokens: Clinical Precision (Plus Jakarta Sans / Inter, primary `#0f52ba`) scoped under ActiveClinic CSS — do not import BlessBoard Sacred Modernity.
