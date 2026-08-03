# AC-V6-S06 — Roles and Access Management

**Stage:** AC-V6-S06 / AC-V6-S06R  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_S06_ROLES_ACCESS_PARTIAL`

No ActiveClinic Stitch screens exist for roles/access (inventory **STITCH_GAP**). Implementation is **functional / shell design-system** UI on the AC-V6-S02 shell. Visual parity is **VISUAL_BLOCKED**.

---

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Route | Status |
|---|---|---|---|---|
| *(none — Access overview)* | — | Desktop | `GET /app/access` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Access overview mobile)* | — | Mobile | same URL | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Staff access detail)* | — | D/M | `GET /app/access/staff/:staffId` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Assign role)* | — | D/M | `GET …/assign`, `POST …/roles` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Edit assignment)* | — | D/M | `GET/POST …/roles/:assignmentId` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Revoke confirmation)* | — | D/M | `GET/POST …/roles/:assignmentId/revoke` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Empty / restricted)* | — | D/M | overview empty + 403 | **VISUAL_BLOCKED** / functional COMPLETE |

---

## Routes

| Route | Permission | Notes |
|---|---|---|
| `GET /app/access` | `activeclinic.staff.assign_access` | Overview + filters |
| `GET /app/access/staff/:staffId` | `assign_access` | Staff access detail |
| `GET /app/access/staff/:staffId/assign` | `assign_access` | Assign form |
| `POST /app/access/staff/:staffId/roles` | `assign_access` + CSRF | Create assignment |
| `GET …/roles/:assignmentId/edit` | `assign_access` | Edit form |
| `POST …/roles/:assignmentId` | `assign_access` + CSRF | Expiry update or replace |
| `GET/POST …/roles/:assignmentId/revoke` | `assign_access` + CSRF | Soft revoke |

Placeholder catalogue-only `/app/access` in `activeClinicAppRoutes` was removed; routes live in `activeClinicAccessRoutes.js`.

---

## Role catalogue

Foundational ActiveClinic roles only:

- `activeclinic_network_admin` — organization scope
- `activeclinic_facility_admin` — facility scope
- `activeclinic_staff` — organisation or facility scope

Shared catalogue: `blessboard.roles` / `permissions` / `role_permissions`.  
Assignments: `activeclinic.staff_role_assignments` (not BlessBoard user-role assignments).

Additive seed: `db/migrations/blessboard/079_activeclinic_facility_admin_assign_access.sql` grants `assign_access` to facility admins. Privilege escalation remains service-enforced.

---

## Grantability

| Actor | May grant |
|---|---|
| Network admin with `assign_access` | All foundational roles; org + facility scopes they own |
| Facility admin with `assign_access` | Facility admin + staff roles **only** for facilities where the actor has an active facility assignment |
| Ordinary staff | None |

Protections:

- No self-escalation to network admin
- No BlessBoard / clinical role grants
- No client-submitted permission key lists
- No cross-organization targets
- Target must be active or invited
- Facility-scoped grants require an active staff↔facility assignment
- Suspended / inactive actors cannot grant

---

## Assignment lifecycle / edit-revoke policy

- **Create:** insert active assignment via `assignFoundationalStaffRole` → `assignStaffRole`
- **Expiry edit:** updates `expires_at` only; preserves assignment history
- **Role/scope change:** revoke old assignment + create new one (`replaceStaffRoleAssignment`)
- **Revoke:** soft status `revoked` with `revoked_at` / reason; never hard delete; immediate authorization effect

---

## Effective access

An assignment is **effective** only when all hold:

- assignment status `active` and not past `expires_at`
- staff status allows access (not suspended/inactive/archived)
- ActiveClinic product enrolment active
- for facility scope: active staff facility assignment and operational facility

Overview default filter shows currently effective assignments.

---

## Loaders and services

- `loadActiveClinicAccessOverviewScreen`
- `loadActiveClinicStaffAccessDetailScreen`
- `loadActiveClinicAssignRoleScreen`
- `loadActiveClinicEditRoleScreen`
- `loadActiveClinicRevokeRoleScreen`
- `activeClinicAccessManagementService` (grantability + governed assign/edit/revoke)
- Repository additions: org/staff assignment listings, find by id, expiry update

---

## Bootstrap repair summary

Isolated re-run of `db-bootstrap-foundation` and `db-foundation` on this tree: **26/26 pass**.

Earlier AC-V6-09 suite reported 7 empty-DB failures; those did **not** reproduce. Accidental Finder duplicates (`* 2.sql`) for platform 020/025 and blessboard 077 were removed so they cannot confuse migration discovery.

Upgrade path: additive `079_…assign_access.sql` only; finalized migrations not rewritten.

---

## Accessibility

- One H1 via shell page header
- Filter labels + table caption
- Card links on mobile with focus styles
- Form labels for role/scope/facility/expiry
- Validation summary with `role="alert"`
- Status text accompanies colour badges

---

## Security

- Organization from authenticated session only
- Permission middleware + service grantability
- CSRF on every write
- Soft revoke retained for audit
- No internal deployment secrets on pages
- Privilege-escalation tests cover facility→network, cross-facility, raw permissions, cross-org, self-escalation

---

## Tests

```bash
node --test tests/activeclinic-roles-access-parity.test.js
node --test tests/db-bootstrap-foundation.test.js tests/db-foundation.test.js
```

---

## Intentional differences / remaining gaps

- **VISUAL_BLOCKED:** no Stitch access designs — shell tokens only
- Custom roles / permission editor not implemented
- Clinical roles not implemented
- Assignment history UI is status-inclusive listing, not a separate audit timeline
- S01–S05 remain PARTIAL (auth/shell/admin visual gaps) — do not block access workflows
- Organization settings (S07) not started

---

## Gate for AC-V6-S07

S06 reaches a **non-blocking PARTIAL** with bootstrap green and access no longer a placeholder.  
**AC-V6-S07 — Organization Settings** may begin.
