# AC-V6-S05 — Staff Create, Invite, Edit & Account Actions

**Stage:** AC-V6-S05  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_S05_STAFF_MANAGEMENT_PARTIAL`

No ActiveClinic Stitch screens exist for staff create/invite/edit (inventory **STITCH_GAP**). Implementation is **functional / shell design-system** UI. Visual parity is **VISUAL_BLOCKED**.

---

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Route | Status |
|---|---|---|---|---|
| *(none — Add/invite staff)* | — | D/M | `GET/POST /app/staff/new`, `POST /app/staff` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Invitation confirmation)* | — | D/M | create success panel | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Edit staff)* | — | D/M | `GET/POST …/:staffId/edit`, `POST …/:staffId` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Account actions)* | — | D/M | detail panel + existing admin POSTs | **VISUAL_BLOCKED** / functional COMPLETE (S04+S05) |

---

## Routes

| Route | Permissions |
|---|---|
| `GET /app/staff/new` | `staff.create` (+ invite for full flow) |
| `POST /app/staff` | `staff.create` + `staff.invite` + CSRF |
| `GET /app/staff/:staffId/edit` | `staff.update` |
| `POST /app/staff/:staffId` | `staff.update` (+ `assign_facility` for assignment sync) |
| Lifecycle POSTs | unchanged under `/app/staff/:staffId/…` (AC-V6-09) |

Create uses `inviteActiveClinicStaff` orchestration (identity, link, facilities, role, token).

---

## Create / invite

- Single-form flow (no invented multi-step).
- Fields: identity/contact, employment, facility multi-select + primary, foundational role (if `assign_access`), issue invitation.
- Network admin role option only for network administrators.
- Facility admins: assignable facilities limited to their assignments; no network-admin role.
- Confirmation shows activation URL once, copy/email/WhatsApp share, honest `link_generated` delivery.
- Raw tokens not stored; not shown outside authorized confirmation.

## Edit

- Profile fields via `updateStaffMemberProfile`.
- Ownership (org/HCO/identity) immutable.
- Facility sync via assign/remove/set-primary when permitted.
- Role editing deferred to access-management wave.

## Account actions

Detail panel (S04) + CSRF-backed admin routes: reissue/revoke invitation, reset, require password change, revoke sessions, unlock, suspend/restore.

---

## Intentional differences

- VISUAL_BLOCKED — no Stitch designs
- No multi-step review screen (single form + confirmation)
- No delivery provider — always honest link-generated messaging
- Role editor deferred

---

## Tests

`tests/activeclinic-staff-management-parity.test.js`

## Gate for AC-V6-S06

**OPEN** — recommend **AC-V6-S06 — Roles and Access Management**.
