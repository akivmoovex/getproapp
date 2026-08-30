# BlessBoard Users, Roles & Permissions — Stitch → V7 gap matrix

**Stitch project:** `5480028321322186480` (BlessBoard User Management)  
**RBAC authority:** existing V7 BlessBoard catalogue + legacy `user_roles`  
**Date:** 2026-08-30

Classification: `EXACT_OR_NEAR_EXACT` · `VISUAL_RESTYLE_REQUIRED` · `BEHAVIOR_GAP` · `MISSING_SCREEN` · `PRODUCT_DIFFERENCE` · `DUPLICATE_STITCH_SCREEN` · `NOT_APPLICABLE`

Desktop/mobile pairs are listed separately. They are not discarded duplicates; mobile is a required variant.

---

## Matrix

| Stitch screen | Existing route/component | Data already available | Missing GUI | Missing behavior | Reuse/new | Priority | Class |
| ------------- | ------------------------ | ---------------------- | ----------- | ---------------- | --------- | -------- | ----- |
| Users List - Desktop `a5858f87…` | `GET /hq/settings/staff-access` · `staff-access-list.ejs` | Users, roles, branches, status, phone/email | Stitch header, stat cards, table, chips, pagination | User-status filter (Active/Pending/Inactive); last_login display | Restyle + extend `staffAccessService` | P0 | `VISUAL_RESTYLE_REQUIRED` |
| Users List - Mobile `56e1a5b8…` | same | same | Card list, FAB invite, compact stats | same | Restyle | P0 | `VISUAL_RESTYLE_REQUIRED` |
| User Access - Desktop `215febd3…` | `GET /hq/settings/staff-access/:userId` · `staff-access-detail.ejs` | Identity, roles, scopes, effective permissions, last_login_at | Stitch header, memberships, locked permissions | Assign as modal | Restyle | P0 | `VISUAL_RESTYLE_REQUIRED` |
| User Access - Mobile `f4bb67f7…` | same | same | Stacked sections, role delete affordance | Assign as drawer | Restyle | P0 | `VISUAL_RESTYLE_REQUIRED` |
| Assign User Role - Desktop `dd93a11f…` | Inline form on detail · `POST …/:userId/assign` | Catalogue roles, church/branch scopes, CSRF | Modal matching Stitch | Visual Global vs Branch; extra V7 scopes remain available | Restyle existing POST | P0 | `VISUAL_RESTYLE_REQUIRED` |
| Assign User Role - Mobile `87d29aca…` | same | same | Bottom sheet | same | Restyle | P0 | `VISUAL_RESTYLE_REQUIRED` |
| Effective Permissions - Desktop `c4c7c2bf…` | Detail `effectiveGrouped`; role detail | Resolved permission keys + sources | Grouped granted/not-granted Stitch list | None (read-only already) | Restyle | P0 | `VISUAL_RESTYLE_REQUIRED` |
| Effective Permissions - Mobile `51565877…` | same | same | Accordion groups | None | Restyle | P0 | `VISUAL_RESTYLE_REQUIRED` |
| Roles Catalogue - Desktop `4e936ed5…` | `GET /hq/settings/roles` · `staff-roles-catalogue.ejs` | Role catalogue, assigned counts, permission groups | Table layout | Filter `activeclinic_*` from church UI | Restyle + filter | P0 | `VISUAL_RESTYLE_REQUIRED` |
| Roles Catalogue - Mobile `afcf500a…` | same | same | Cards | **Create Role** not in V7 | Restyle; omit Create Role | P0 | `VISUAL_RESTYLE_REQUIRED` + `PRODUCT_DIFFERENCE` |
| Access Safety States - Desktop `6f047dd6…` | `confirm()` on revoke only | Revoke + CSRF | Stitch dialogs | Last HQ admin guard | New dialogs + `blessBoardLastAdminGuard` | P0 | `BEHAVIOR_GAP` + `MISSING_SCREEN` (as page) |
| Access Safety States - Mobile `9d1a85a4…` | same | same | Drawers | Last HQ admin | same | P0 | `BEHAVIOR_GAP` |
| Invite User (CTA only) | `GET/POST /hq/settings/staff-access/invite` | Phone-first invite, CSRF, roles | Stitch-styled form | No dedicated Stitch canvas | Restyle existing invite | P1 | `VISUAL_RESTYLE_REQUIRED` |
| Disable User | none | `users.status` exists; no HQ mutation | Stitch button | Safe HQ deactivate not implemented | Omit | — | `PRODUCT_DIFFERENCE` |
| Create Role | none | Catalogue is migration-seeded | Mobile CTA | Custom roles unsupported | Omit | — | `PRODUCT_DIFFERENCE` |
| Edit permission matrix | none | Role→permission map is read-only | Stitch shows locked rows | Must stay read-only | Present read-only | — | `PRODUCT_DIFFERENCE` (intentional) |
| MFA badge | none | Not stored | “MFA Enabled” | Do not invent | Omit | — | `PRODUCT_DIFFERENCE` |
| 12% trend on Total Users | none | No trend metric | Stat badge | Fake data forbidden | Omit | — | `PRODUCT_DIFFERENCE` |
| Apex `/admin/users` | platform admin | Separate product | — | Out of this Stitch project | Leave | — | `NOT_APPLICABLE` |
| Legacy `/hq/roles` | `hqRoleAdminRoutes` | church_hq_admin / branch_admin | Not in this Stitch file | Keep for session-baseline roles | Unchanged chrome | — | `NOT_APPLICABLE` (legacy companion) |

---

## Architecture reuse (do not replace)

| Capability | Location | Action |
|------------|----------|--------|
| Permission catalogue | `blessboard.permissions` / `roles` / `role_permissions` | Reuse |
| Scoped assignments | `blessboard.user_role_assignments` | Reuse |
| Legacy session roles | `blessboard.user_roles` | Reuse; display as Church HQ Admin / Branch Admin |
| Authorization | `blessBoardRbacAuthorizationService` | Reuse |
| CSRF | `v5Csrf` | Reuse |
| Tenant isolation | org/church on every query + 404 concealment | Reuse |
| Invite | `createScopedTeamMember` | Reuse |
| Last-admin | **missing** | Add equivalent of ActiveClinic `assertNotLastOrgAdminRemoval` for Church HQ Admin |

### Protected last-admin role(s)

Determined from V7 model (not guessed):

- **Primary (session-establishing):** legacy `church_hq_admin` on the church.
- **Catalogue peers that also count as church-wide administrators:** `organisation_administrator`, `church_system_administrator` at organisation or church scope, with `users.status` in `active` / `invited`.

The church must retain at least one such active administrator.

---

## Information architecture (implemented)

**Users & Access** (not a new nav folder):

1. **Users** — `/hq/settings/staff-access`
2. **Invite** — `/hq/settings/staff-access/invite` (no extra nav)
3. **User access** — `/hq/settings/staff-access/:userId` (no extra nav)
4. **Roles** — `/hq/settings/roles`
5. **Role detail** — `/hq/settings/roles/:roleKey` (no extra nav)

Assign role, revoke confirm, last-admin blocked, unauthorized: dialogs/drawers.

---

## Product differences (intentional)

1. No custom role creation.
2. Permissions remain read-only.
3. No HQ user disable/delete (Stitch Disable User).
4. No MFA indicator.
5. No fake trend percentages or demo user counts.
6. Self-demotion remains **blocked** (existing `self_elevation` / `self_escalation`), stronger than Stitch “Proceed Anyway”.
7. Invite is phone-first; Stitch samples are email-centric.
8. Extra V7 scopes (ministry, department, cell, class) remain assignable beyond Stitch Global/Branch.
9. ActiveClinic roles in the shared catalogue are hidden from BlessBoard HQ UI.
10. Stitch sample role names (Member Manager, Tech Lead, Volunteer) are not invented as roles.
