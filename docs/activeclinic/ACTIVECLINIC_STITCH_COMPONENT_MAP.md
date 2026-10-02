# ActiveClinic — Stitch Component Map (AC-V6-11)

Planning only — no components created in AC-V6-11.

Existing code: `views/activeclinic/layouts/app-shell.ejs`, `partials/sidebar.ejs`, `public/activeclinic/ac-app.css`, `ac-shell-nav.js`.

---

## Shell

| Component | Existing? | AC-specific | Reuse | D/M | A11y | Wave |
|---|---|---|---|---|---|---|
| App layout | yes | yes | all `/app` | sidebar → drawer | landmarks, skip | W1 refine |
| Sidebar | yes | yes | foundation | desktop | nav label | W1 |
| Mobile navigation drawer | yes (JS) | yes | all | Stitch P01 drawer | Escape, focus trap, backdrop | W1 parity |
| Header | yes | yes | all | height/token gaps | — | W1 |
| Organization switcher | partial (select page) | yes | multi-org | — | — | W1 |
| Facility switcher | partial | yes | multi-facility | — | — | W1 |
| Account menu | minimal | yes | — | — | — | W1 |

---

## Navigation / content

| Component | Existing? | Wave | Notes |
|---|---|---|---|
| Tabs / breadcrumbs | breadcrumbs yes | W1 | |
| Filters / pagination | facility filter bar yes; pagination no | S03 filters; staff later |
| Page header + actions | yes | W1 |
| Summary / detail cards | facility mobile cards | S03 |
| Data table | facilities desktop table | S03 |
| Mobile list card | facilities mobile | S03 |
| Status badge | facility status/type/primary | S03 partial `facility-badges` |
| Definition list | facility detail | S03 |
| Activity / audit timeline | no | later | `audit.view` |

---

## Forms

| Component | Existing? | Wave |
|---|---|---|
| Text / phone / email / select | browser defaults on auth | W1 visual |
| Facility picker / role picker | no shared | W1 admin |
| Validation summary | inline errors | W1 |
| Sticky action bar | no | W1 forms |
| CSRF hidden field | yes (platform) | all writes |

---

## Feedback

| Component | Stitch | Existing | Wave |
|---|---|---|---|
| Empty / loading / error / offline / restricted | Shared + P01 states | `ac-inline-state`, `access-state`, taxonomy, error handler (S08); offline deferred | W1 / **S08** |
| Feature locked / subscription | not in inventory | — | product decision |
| Confirmation / toast / flash | — | flash slot in shell | W1 |
| Destructive warning | — | — | W1 admin |

---

## Clinical components (future)

Patient banner, encounter workspace, Rx builder, queue boards, specimen labels, medicine labels, billing line items — **future**, Wave 2+. Marked not for foundation shell work.

---

## Implementation guidance

1. Prefer shared ActiveClinic partials under `views/activeclinic/partials/` over BlessBoard.  
2. Scope CSS to ActiveClinic selectors in `ac-app.css`.  
3. Desktop/mobile share markup where possible; drawer is the primary mobile chrome difference.


## AC-V6-S01 auth components (added)

| Component | Path | Notes |
|---|---|---|
| Auth layout | `views/activeclinic/layouts/auth-shell.ejs` | Public auth surfaces |
| Auth CSS | `public/activeclinic/ac-auth.css` | Navy auth tokens; shell teal unchanged |
| Auth JS | `public/activeclinic/ac-auth.js` | Password toggle + loading |
| Login / lifecycle views | `views/activeclinic/auth/*` | S01 |
| Auth mark / brand / password partials | `views/activeclinic/partials/auth-*` | Reusable |

## AC-V6-S02 shell components

| Component | Path |
|---|---|
| App shell | `views/activeclinic/layouts/app-shell.ejs` |
| Sidebar / drawer | `views/activeclinic/partials/sidebar.ejs` |
| Nav icons | `views/activeclinic/partials/nav-icon.ejs` |
| Dashboard loader | `src/activeclinic/services/loadActiveClinicDashboardHome.js` |
| Access/session state | `views/activeclinic/app/access-state.ejs` + `activeClinicStateTaxonomy.js` + `ac-inline-state.ejs` (AC-V6-S08) |
| Access overview | `views/activeclinic/app/access-content.ejs` |
| Staff access detail | `views/activeclinic/app/access-staff-content.ejs` |
| Assign / edit role form | `views/activeclinic/app/access-role-form-content.ejs` |
| Revoke confirmation | `views/activeclinic/app/access-revoke-content.ejs` |
| Settings overview | `views/activeclinic/app/settings-content.ejs` |
| Organization profile | `views/activeclinic/app/settings-organization-content.ejs` |
| Organization edit form | `views/activeclinic/app/settings-organization-form-content.ejs` |
| Settings link panel | `views/activeclinic/app/settings-link-content.ejs` |
| Account settings | `views/activeclinic/app/settings-account-content.ejs` |
| App CSS | `public/activeclinic/ac-app.css` (S02 tokens/nav) |

## AC-V6-S03 facility components

| Component | Path |
|---|---|
| Facility badges | `views/activeclinic/partials/facility-badges.ejs` |
| Facilities list | `views/activeclinic/app/facilities-list-content.ejs` |
| Facility detail | `views/activeclinic/app/facility-detail-content.ejs` |
| Facility form | `views/activeclinic/app/facility-form-content.ejs` |
| Screen loaders | `src/activeclinic/services/loadActiveClinicFacilityScreens.js` |
| Facility routes | `src/activeclinic/http/activeClinicFacilityRoutes.js` |
| Filter bar / mobile cards CSS | `public/activeclinic/ac-app.css` (`s03-1`) |

## AC-V6-S04 staff components

| Component | Path |
|---|---|
| Staff badges / avatar | `views/activeclinic/partials/staff-badges.ejs` |
| Staff list | `views/activeclinic/app/staff-list-content.ejs` |
| Staff detail | `views/activeclinic/app/staff-detail-content.ejs` |
| Screen loaders | `src/activeclinic/services/loadActiveClinicStaffScreens.js` |
| Staff routes | `src/activeclinic/http/activeClinicStaffRoutes.js` |
| App CSS | `public/activeclinic/ac-app.css` (`s04-1`) |

## AC-V6-S05 staff management components

| Component | Path |
|---|---|
| Staff form | `views/activeclinic/app/staff-form-content.ejs` |
| Invite result | `views/activeclinic/app/staff-invite-result-content.ejs` |
| Form loaders | `src/activeclinic/services/loadActiveClinicStaffFormScreens.js` |
| Profile update | `updateStaffMemberProfile` in staff service |
| Staff routes | `src/activeclinic/http/activeClinicStaffRoutes.js` (create/edit) |
| App CSS | `public/activeclinic/ac-app.css` (`s05-1`) |
