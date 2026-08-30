# BlessBoard Users, Roles & Permissions — Stitch inventory

**Stitch project:** BlessBoard User Management  
**Project ID:** `5480028321322186480`  
**URL:** https://stitch.withgoogle.com/projects/5480028321322186480  
**Design system:** Modern Spiritual (Geist, navy `#1E293B` / `#091426`, sage/teal `#5F9EA0`)  
**Inventoried:** 2026-08-30  
**Product surface:** BlessBoard authenticated church HQ (not apex marketing)

This project is the GUI authority for BlessBoard Users / Roles / Access. It is distinct from GetPro Church Platform (`17124191473876947591`). Do not import ActiveClinic screens or terminology.

---

## Summary

| Count | Value |
|-------|------:|
| Total screens in project | 12 |
| Relevant screens | 12 |
| Desktop | 6 |
| Mobile | 6 |
| Duplicate pairs (desktop+mobile of same surface) | 6 pairs — not discarded; both implemented |
| Non-applicable | 0 |
| Standalone loading screens | 0 (none in project) |
| Empty-state screens | 0 (none in project; implement empty states from existing product copy) |

---

## Canonical information architecture

| Conceptual screen | Canonical BlessBoard route | Interaction |
|-------------------|----------------------------|-------------|
| Users | `GET /hq/settings/staff-access` | Page |
| Invite user | `GET/POST /hq/settings/staff-access/invite` | Page (Stitch CTA; no dedicated Stitch invite canvas) |
| User access / detail | `GET /hq/settings/staff-access/:userId` | Page |
| Assign role | same detail URL + dialog | Desktop modal / mobile drawer |
| Effective permissions | section on user detail | Read-only |
| Roles catalogue | `GET /hq/settings/roles` | Page |
| Role detail / permissions | `GET /hq/settings/roles/:roleKey` | Page (read-only) |
| Access safety states | dialogs on Users / User access | Not a navigable page |

HQ nav: keep existing `/hq` shell. Rename primary entry **Users**. Roles catalogue remains `/hq/settings/roles` (linked from Users + Roles page). Legacy fixed-role UI stays at `/hq/roles`.

---

## Screen inventory

### 1. Users List — Desktop

| Field | Value |
|-------|--------|
| Stitch screen name | Users List - Desktop |
| Screen ID | `a5858f87e41c4fa6a72fbdd3f570e835` |
| Desktop/mobile | Desktop (canvas 1280×1088) |
| Main purpose | Directory of church users with access, filters, invite |
| Major sections | Sidebar; top search/app bar; page title + Invite User; 4 summary cards; filter bar; data table; pagination |
| Important text | Users; Manage platform access, roles, and branch assignments.; Invite User; Total Users; Church Admins; Branch Admins; Pending Invitations; table headers User / Contact / Role / Scope / Status / Last Active |
| Buttons/actions | Invite User; search; Role / Branch / Status filters; tune; row more_vert; pagination |
| Tables/cards | 4 stat cards; user table (avatar/initials, email, phone, role, Global or branch, status chip, last active) |
| Filters/search | Search by name or email; Role; Branch; Status (Active / Pending / Inactive) |
| Dialogs/drawers | Row overflow menu (implied) |
| Existing BlessBoard route | `GET /hq/settings/staff-access` |
| Implementation status | partial |
| Recommended canonical route | `GET /hq/settings/staff-access` |

### 2. Users List — Mobile

| Field | Value |
|-------|--------|
| Stitch screen name | Users List - Mobile |
| Screen ID | `56e1a5b8a74b498fa33264cd76758fa4` |
| Desktop/mobile | Mobile (390×586 canvas) |
| Main purpose | Compact user directory |
| Major sections | Title + search; two stats (Total Users, Admins); search + filter; user cards; FAB invite; bottom nav |
| Important text | Users; Total Users; Admins; Active / Inactive chips; role • branch on cards |
| Buttons/actions | Search; filter_list; person_add FAB |
| Tables/cards | User cards (avatar, name, role • branch, status chip) |
| Filters/search | Search + filter icon |
| Dialogs/drawers | Filter sheet implied |
| Existing BlessBoard route | `GET /hq/settings/staff-access` |
| Implementation status | partial |
| Recommended canonical route | `GET /hq/settings/staff-access` |

### 3. User Access — Desktop

| Field | Value |
|-------|--------|
| Stitch screen name | User Access - Desktop |
| Screen ID | `215febd3f5ed4b4c9a8d90219c6f4778` |
| Desktop/mobile | Desktop |
| Main purpose | One user’s identity, memberships, roles/scope, read-only effective permissions |
| Major sections | Breadcrumb Users › name; identity header; Disable User; Assign Role; Account Details; Memberships; Roles & Scope; Effective Permissions (READ-ONLY) |
| Important text | Account Details; User ID; Last Login; Authentication; Memberships; Global Church / Branch Location; Roles & Scope; Effective Permissions are derived from assigned roles |
| Buttons/actions | Disable User; Assign Role; Manage Roles; permission rows are locked |
| Tables/cards | Identity header; detail cards; permission list with granted/denied |
| Filters/search | None |
| Dialogs/drawers | Assign Role modal (screen 5); revoke/disable safety (screen 11) |
| Existing BlessBoard route | `GET /hq/settings/staff-access/:userId` |
| Implementation status | partial |
| Recommended canonical route | `GET /hq/settings/staff-access/:userId` |

### 4. User Access — Mobile

| Field | Value |
|-------|--------|
| Stitch screen name | User Access - Mobile |
| Screen ID | `f4bb67f788af4d829e3f8320c6237654` |
| Desktop/mobile | Mobile |
| Main purpose | Stacked user access |
| Major sections | Back; identity; Profile & Memberships; Roles with delete; Assign New Role; Permissions (Read-Only) |
| Important text | Active User; Phone; Primary Branch; Other Memberships; Assigned dates; Permissions are automatically determined by assigned roles |
| Buttons/actions | delete_outline per role; Assign New Role |
| Tables/cards | Stacked sections |
| Filters/search | None |
| Dialogs/drawers | Assign role bottom sheet (screen 6) |
| Existing BlessBoard route | `GET /hq/settings/staff-access/:userId` |
| Implementation status | partial |
| Recommended canonical route | `GET /hq/settings/staff-access/:userId` |

### 5. Assign User Role — Desktop

| Field | Value |
|-------|--------|
| Stitch screen name | Assign User Role - Desktop |
| Screen ID | `dd93a11f4f0a410ebd6365bfa12ff960` |
| Desktop/mobile | Desktop modal |
| Main purpose | Assign a catalogue role with Global vs Branch scope |
| Major sections | Modal: target user; Select Role; Role Scope radios; conditional branch search; Cancel / Assign Role |
| Important text | Assign Role; Global (Entire Church); Access across all campuses and ministries.; Branch Specific; Limit access to selected locations. |
| Buttons/actions | Close; Cancel; Assign Role |
| Tables/cards | Modal card |
| Filters/search | Branch search when branch-specific |
| Dialogs/drawers | This screen **is** the dialog |
| Existing BlessBoard route | `POST /hq/settings/staff-access/:userId/assign` (form currently inline) |
| Implementation status | partial |
| Recommended canonical route | Dialog on `/hq/settings/staff-access/:userId` |

### 6. Assign User Role — Mobile

| Field | Value |
|-------|--------|
| Stitch screen name | Assign User Role - Mobile |
| Screen ID | `87d29acaf4c9494188b31a9f1ba25af8` |
| Desktop/mobile | Mobile sheet |
| Main purpose | Same assign flow as bottom sheet |
| Major sections | Assign Role; user chip; Role select; Access Scope Global / Branch Specific; Assign to Branch; Cancel / Assign Role |
| Important text | Select a role and define its scope. |
| Buttons/actions | close; Cancel; Assign Role |
| Tables/cards | Full-height sheet |
| Filters/search | Branch select |
| Dialogs/drawers | This screen **is** the drawer |
| Existing BlessBoard route | Same POST as desktop |
| Implementation status | partial |
| Recommended canonical route | Drawer on user detail |

### 7. Effective Permissions — Desktop

| Field | Value |
|-------|--------|
| Stitch screen name | Effective Permissions - Desktop |
| Screen ID | `c4c7c2bfbbca408e82505e68aa4fc5c9` |
| Desktop/mobile | Desktop |
| Main purpose | Read-only resolved permission groups |
| Major sections | Title + explanation; search/filter; grouped permissions with Granted by / Not granted |
| Important text | These permissions are read-only and derived from assigned roles.; Granted; Not granted |
| Buttons/actions | Search; Filter (no edit) |
| Tables/cards | Grouped permission rows |
| Filters/search | Search + Filter |
| Dialogs/drawers | None |
| Existing BlessBoard route | Section of `/hq/settings/staff-access/:userId`; role permissions also `/hq/settings/roles/:roleKey` |
| Implementation status | partial |
| Recommended canonical route | User detail (user-resolved) + role detail (role catalogue) |

### 8. Effective Permissions — Mobile

| Field | Value |
|-------|--------|
| Stitch screen name | Effective Permissions - Mobile |
| Screen ID | `51565877b3e04407860a3e9cb120aac4` |
| Desktop/mobile | Mobile |
| Main purpose | Accordion groups of granted/not granted |
| Major sections | Back; role/user context; expandable groups |
| Important text | This view displays the resolved permissions… Read-only view.; Granted; Not granted |
| Buttons/actions | Accordion expand |
| Tables/cards | Accordion cards |
| Filters/search | None |
| Dialogs/drawers | None |
| Existing BlessBoard route | Same as desktop |
| Implementation status | partial |
| Recommended canonical route | User detail / role detail |

### 9. Roles Catalogue — Desktop

| Field | Value |
|-------|--------|
| Stitch screen name | Roles Catalogue - Desktop |
| Screen ID | `4e936ed5d41a49feb781868b2e751c9d` |
| Desktop/mobile | Desktop |
| Main purpose | Read-only role catalogue with user counts and View |
| Major sections | Title Roles; table Role / Description / Scope / Users / Permissions / Action |
| Important text | View and manage platform roles and their access levels.; Church HQ Admin; Branch Admin; Member Manager (Stitch sample — V7 uses catalogue names) |
| Buttons/actions | View / chevron_right per row |
| Tables/cards | Roles table |
| Filters/search | Header search (shell) |
| Dialogs/drawers | None |
| Existing BlessBoard route | `GET /hq/settings/roles` |
| Implementation status | partial |
| Recommended canonical route | `GET /hq/settings/roles` |

### 10. Roles Catalogue — Mobile

| Field | Value |
|-------|--------|
| Stitch screen name | Roles Catalogue - Mobile |
| Screen ID | `afcf500a82704e43a1b9a417d8240921` |
| Desktop/mobile | Mobile |
| Main purpose | Role cards + Create Role CTA |
| Major sections | Roles; Create Role; cards with scope, user count, permission count, View Permissions |
| Important text | Manage system access and permissions; Create Role; Global Scope / Local Scope |
| Buttons/actions | Create Role (see product difference); View Permissions |
| Tables/cards | Role cards |
| Filters/search | None |
| Dialogs/drawers | None |
| Existing BlessBoard route | `GET /hq/settings/roles` |
| Implementation status | partial |
| Recommended canonical route | `GET /hq/settings/roles` |

### 11. Access Safety States — Desktop

| Field | Value |
|-------|--------|
| Stitch screen name | Access Safety States - Desktop |
| Screen ID | `6f047dd6280c48caa1493c2dd60ffaed` |
| Desktop/mobile | Desktop (pattern sheet, not a product page) |
| Main purpose | Confirmation / blocked / warning / error patterns |
| Major sections | Remove Role Confirmation; Blocked: Last Admin; Self-Demotion Warning; Assign Branch error; Unauthorized Action; Disable User Account |
| Important text | church must have at least one active Church HQ Administrator; You are about to remove your own administrator role |
| Buttons/actions | Cancel; Remove Role; Proceed Anyway; Dismiss; Request Access; Disable User |
| Tables/cards | Dialog cards |
| Filters/search | None |
| Dialogs/drawers | This screen **is** the dialog catalogue |
| Existing BlessBoard route | None (inline dialogs) |
| Implementation status | missing |
| Recommended canonical route | Dialogs on Users / User access (not a nav item) |

### 12. Access Safety States — Mobile

| Field | Value |
|-------|--------|
| Stitch screen name | Access Safety States - Mobile |
| Screen ID | `9d1a85a4ec504fc2869cd032615a7730` |
| Desktop/mobile | Mobile drawers |
| Main purpose | Same safety patterns as bottom sheets |
| Major sections | Confirmation; Blocked Action; Self-Demotion Warning |
| Important text | You cannot remove the last Church HQ Admin |
| Buttons/actions | Yes, Remove Role; Cancel; Dismiss; I Understand |
| Tables/cards | Drawers |
| Filters/search | None |
| Dialogs/drawers | This screen **is** the drawer catalogue |
| Existing BlessBoard route | None |
| Implementation status | missing |
| Recommended canonical route | Drawers on User access |

---

## Screens not in this Stitch project

| Topic | Notes |
|-------|--------|
| Dedicated Invite User canvas | CTA only on Users list. BlessBoard keeps `/hq/settings/staff-access/invite`. |
| Dedicated loading / empty / error pages | None. Use in-page empty and existing HQ error/404 concealment. |
| Custom role editor / permission matrix editor | Mobile “Create Role” only. V7 catalogue is read-only. |
| Apex `/admin/users` | Platform operator surface — out of this tenant Stitch project. |

---

## Terminology mapping (Stitch → V7)

| Stitch | BlessBoard V7 |
|--------|----------------|
| Users / Team Members | Staff with church system access (`/hq/settings/staff-access`) |
| Church Admin / Church HQ Admin | Legacy `church_hq_admin`; catalogue `organisation_administrator` / `church_system_administrator` |
| Branch Admin | Legacy `branch_admin`; catalogue `branch_administrator` |
| Global / Entire Church | `scope_type` organisation or church |
| Branch / Campus | `blessboard.branches` |
| Member Manager / Volunteer / Tech Lead | Stitch samples — map only to real catalogue `display_name` values |
| Disable User | No HQ deactivation API — product difference |
| Create Role | No custom roles — product difference |
| MFA Enabled | Not stored on `blessboard.users` — omit |
| Fake 12% trend on Total Users | Do not display |
