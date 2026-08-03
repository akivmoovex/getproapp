# ActiveClinic Stitch — Permission Matrix (Phases 1–7)

**Audited:** 2026-08-04

Central checks: `createRequireActiveClinicAuth`, `createRequireActiveClinicPermission`, `activeClinicAuthorizationService`.

| Phase | Screens | Permission / gate | Isolation |
|------:|---------|-------------------|-----------|
| 1 | Login | Public; post-auth product enablement | Platform identity + AC cookie |
| 1 | Shell / Dashboard / Drawer | Authenticated AC staff session | Org + selected facility |
| 1 | Shared / Access Restricted | Authz denial path | Same |
| 2 | Patient list/profile | `patients.read` (or equiv. foundation perm) | Organization (+ facility scope where assigned) |
| 2 | Register/edit/identifiers/contacts | `patients.write` | Organization |
| 2 | Duplicate override | Elevated override permission | Organization |
| 2 | Archive / mark deceased | Privileged patient status write | Organization + audit |
| 3–7 | All clinical/finance | **Not assigned** — no secure routes until schema + RBAC keys exist | N/A |

### Hard rules

- Never authorize only via hidden links/buttons.
- Never trust client-supplied organizationId/facilityId for authorization.
- Prefer central permission keys over role-name checks.
