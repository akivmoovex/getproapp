# AC-V6-S04 — Staff Directory and Staff Detail Parity

**Stage:** AC-V6-S04  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_S04_STAFF_DIRECTORY_PARTIAL`

No ActiveClinic Stitch screens exist for staff directory/detail (inventory **STITCH_GAP**). Implementation is **functional / shell design-system** UI on the AC-V6-S02 shell. Visual parity is **VISUAL_BLOCKED**.

---

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Route | Status |
|---|---|---|---|---|
| *(none — Staff list)* | — | Desktop | `GET /app/staff` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Staff list mobile)* | — | Mobile | same URL | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Staff empty / filters)* | — | D/M | same URL | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Staff detail)* | — | Desktop | `GET /app/staff/:staffId` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Staff detail mobile)* | — | Mobile | same URL | **VISUAL_BLOCKED** / functional COMPLETE |

Product: ActiveClinic Stitch `projects/12272131183982732110` only.

---

## Routes and permissions

| Route | Permission |
|---|---|
| `GET /app/staff` | `activeclinic.staff.view` |
| `GET /app/staff/:staffId` | `activeclinic.staff.view` (+ facility overlap for non–network-admin) |

Lifecycle **actions** on detail post to existing AC-V6-09 admin routes (CSRF + permission):

- invite reissue / revoke → `staff.invite`
- reset / revoke sessions / require password change / unlock → `staff.manage_credentials`
- suspend / restore → `staff.archive`

Create/invite **form** and role/facility **editors** are deferred (later waves).

---

## Scope

- **Network administrator** (role key): organization-wide staff directory.
- **Facility administrator / facility-scoped viewers**: staff who share at least one active facility assignment with the viewer.
- **Ordinary staff** (`activeclinic_staff`): typically lacks `staff.view` → access restricted.
- Cross-organization staff IDs → safe 404.

---

## Loaders

| Loader | File |
|---|---|
| `loadActiveClinicStaffListScreen` | `src/activeclinic/services/loadActiveClinicStaffScreens.js` |
| `loadActiveClinicStaffDetailScreen` | same |

Routes: `src/activeclinic/http/activeClinicStaffRoutes.js`

---

## Filters / search

Allowlisted: `q`, `status`, `employment`, `facility`, `account`.  
Invalid enums ignored. Sort: display name. No pagination (foundation org sizes).

Staff status and account state are **separate** badges/labels.

---

## Privacy

- List: name, job title, status, facility summary, account label — no phone/email on list.
- Detail: contact shown for authorized `staff.view` readers only.
- No password hashes, tokens, failed-login counts, raw role keys, or platform identity IDs in HTML.
- Activation/reset URLs only on one-time invite-result admin responses, never embedded on detail.

---

## Intentional differences

- **VISUAL_BLOCKED** — no Stitch staff designs
- No create/invite form UI (POST APIs exist)
- No role/facility assignment editors
- No audit timeline section (not mapped with ready UI)
- Pagination deferred

---

## Tests

`tests/activeclinic-staff-directory-parity.test.js`

---

## Gate for AC-V6-S05

**OPEN** — recommend **AC-V6-S05 — Staff Invitation and Account Actions** (or Create/Edit Staff if product prioritizes forms), then Roles and Access Management.
