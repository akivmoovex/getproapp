# BlessBoard Users, Roles & Permissions — Stitch parity report

**Stitch project:** BlessBoard User Management `5480028321322186480`  
**Compared:** 2026-08-30  
**Method:** Stitch HTML + design tokens vs implemented EJS/CSS. HQ shell chrome is retained (existing BlessBoard navigation). **No hosted browser pixel overlay** was run in this pass.

**Overall project score (weighted, applicable screens):** **91**

Weighting: visual layout 35% · typography/styles 20% · components 20% · responsive 10% · functional 15%.

Target ≥95 is **not** claimed: the existing HQ shell (Hanken Grotesk, BlessBoard HQ sidebar) remains around Stitch-styled content, and screens were not pixel-diffed in a browser against Stitch.

---

## Screen scores

| Stitch screen | BlessBoard route | Desktop score | Mobile score | Functional score | Overall score | Remaining differences |
| ------------- | ---------------- | ------------: | -----------: | ---------------: | ------------: | --------------------- |
| Users List - Desktop `a5858f87…` | `/hq/settings/staff-access` | 91 | — | 96 | 92 | HQ shell chrome; initials not photos; no bulk checkboxes; no fake 12% trend |
| Users List - Mobile `56e1a5b8…` | same | — | 92 | 96 | 93 | FAB + cards match; bottom nav is existing HQ mobile, not Stitch 4-tab bar |
| User Access - Desktop `215febd3…` | `/hq/settings/staff-access/:userId` | 90 | — | 94 | 91 | No Disable User; no MFA row; User ID is UUID not `USR-…`; Assign is modal |
| User Access - Mobile `f4bb67f7…` | same | — | 91 | 94 | 92 | Same product omissions; memberships derived from roles/branches |
| Assign User Role - Desktop `dd93a11f…` | modal on detail + `POST …/assign` | 93 | — | 97 | 94 | Extra V7 scopes not shown as Stitch radios (Global/Branch only in UI; server still accepts others via API) |
| Assign User Role - Mobile `87d29aca…` | drawer on detail | — | 92 | 97 | 93 | Same; uses overlay sheet |
| Effective Permissions - Desktop `c4c7c2bf…` | section on user detail + `/hq/settings/roles/:roleKey` | 90 | — | 98 | 92 | Shows granted keys only (not a full catalogue of “not granted”); Stitch sample modules (Content/Giving) replaced with V7 modules |
| Effective Permissions - Mobile `51565877…` | same | — | 91 | 98 | 93 | Accordion groups; granted-only list |
| Roles Catalogue - Desktop `4e936ed5…` | `/hq/settings/roles` | 92 | — | 97 | 93 | Real V7 roles not Stitch sample Member Manager; table layout matches |
| Roles Catalogue - Mobile `afcf500a…` | same | — | 90 | 95 | 91 | **Create Role omitted** (product difference) |
| Access Safety States - Desktop `6f047dd6…` | dialogs on user detail | 88 | — | 96 | 90 | Last-admin + revoke confirm implemented; Disable User dialog omitted; self-demotion is **blocked** not “Proceed Anyway”; not a standalone page |
| Access Safety States - Mobile `9d1a85a4…` | drawers on user detail | — | 88 | 96 | 90 | Same |
| Invite User (no Stitch canvas) | `/hq/settings/staff-access/invite` | 86 | 86 | 98 | 88 | Phone-first invite (V7); Stitch only had a CTA |

---

## Screens below 95 — mismatches

### All applicable screens (shell)

1. **Mismatch:** Stitch paints a dedicated Users/Roles sidebar and top bar (Geist, navy `#091426`). Implementation keeps the existing BlessBoard HQ shell.  
2. **Cause:** Stage 4 / architecture — reuse HQ navigation; do not replace the church ops shell for one module.  
3. **Files:** `views/blessboard/v5/partials/hq-shell-start.ejs`, `public/blessboard/v5/hq-admin.css`  
4. **Fix:** Only if product later adopts this Stitch chrome for all HQ — out of scope here.

### Users List

1. No avatar photographs (initials only); no row checkboxes; no 12% trend badge.  
2. Cause: no image store; no bulk API; fake metrics forbidden.  
3. Files: `staff-access-list.ejs`  
4. Fix: none without new product capabilities.

### User Access

1. Disable User and MFA Enabled not shown.  
2. Cause: no HQ deactivation API; MFA not stored.  
3. Files: `staff-access-detail.ejs`  
4. Fix: implement deactivate with last-admin guard if product later requires it.

### Effective Permissions

1. Stitch shows granted **and** not-granted rows for a sample matrix. V7 lists resolved grants only.  
2. Cause: do not invent a second permission matrix.  
3. Files: `staffAccessService.js`, detail/role views  
4. Fix: optional “not granted” would require enumerating the entire catalogue per user — noisy and not authorization-backed as a second matrix.

### Roles Catalogue mobile

1. Create Role CTA omitted.  
2. Cause: catalogue is migration-seeded `is_system`.  
3. File: `staff-roles-catalogue.ejs`  
4. Fix: none for V1.

### Access safety

1. Disable User confirmation not implemented. Self-demotion is refused, not confirmed.  
2. Cause: stronger existing `self_elevation` rule; no disable API.  
3. Files: `blessBoardLastAdminGuard.js`, detail dialogs  
4. Fix: product decision.

---

## Functional QA (automated)

Covered by `tests/blessboard-staff-access.test.js` (including last HQ admin), `tests/blessboard-hq-roles.test.js`, CSRF assign, cross-org 404, catalogue read-only, operational readiness GET `/hq/settings/staff-access`.

Protected last-admin roles: **`church_hq_admin`** (legacy) plus catalogue **`organisation_administrator`** and **`church_system_administrator`** at organisation/church scope, with `users.status` in `active`/`invited`.
