# V2.04 BB Stitch — Phase 4 Member Admin Profile

| Field | Value |
|-------|--------|
| **Phase** | 4 — MEMBER ADMIN PROFILE |
| **Branch** | `V4` |
| **Stitch** | `projects/12773983203917549893` · BB-M06 (+ M07–M12 action surfaces from M06 controls) |
| **Result** | **BB_V204_MEMBER_ADMIN_PROFILE_PASS** |

## Screens

| ID | Route | Permission |
|----|-------|------------|
| BB-M06 | `GET /branch-admin/members/:id` | `members.view` (+ UI hides privileged CTAs) |
| BB-M07 | `GET/POST …/:id/edit` | `members.edit` |
| BB-M08 | `GET/POST …/:id/church-id` | `members.manage_church_id` |
| BB-M09 | `GET/POST …/:id/access` | `members.block` |
| BB-M10 | `GET/POST …/:id/access/block` | `members.block` |
| BB-M11 | `GET/POST …/:id/transfer` | `members.edit` |
| BB-M12 | `GET …/:id/history` | `members.view` |

Authz enforced at **UI** (`resolveAdminCapabilities`), **route** (`gateEdit` / `gateBlock` / `gateChurchId`), and **service** (domain permission checks).

## Rules

| Rule | Enforcement |
|------|-------------|
| Membership ≠ portal | Separate chips/sections; `setPortalAccessStatus` never mutates membership |
| Church ID not member-editable | Profile form read-only; `updateMemberProfile` rejects `memberNumber` |
| Church ID privileged + reason + unique + audit | `manageChurchId` + `REASON_REQUIRED` + clash check + audit |
| Portal block disables access, keeps membership, reason, sessions, audit | `setPortalAccessStatus(blocked)` + session revoke + audit |
| Branch transfer authorized; attendance unchanged; audit | `requestAuthorizedBranchTransfer` + `historical_attendance_unchanged` |
| History human-readable | `presentMemberHistoryEvent` strips action keys / raw metadata |

## Artifacts

- `blessBoardStaffMemberAdminUiService.js`
- Domain: reason gates, session revoke on block, history + transfer helpers
- Templates: restyled `member-detail.ejs` (M06) + `member-edit|church-id|access|access-block|transfer|history.ejs`
- CSS: `.bb-v204-m06`–`m12` in `branch-admin.css`
- Platform: `listAuditEvents` supports `entityId`

## Tests

`node --test tests/v2-04-bb-member-admin-profile.test.js tests/v2-04-bb-member-domain.test.js` — **23 pass**.

Negative authz covered: Church ID without `manage_church_id`, block without `members.block`, transfer without `members.edit`, history without `members.view`, missing reasons, UI capability hiding.

## Gaps

1. Dedicated Stitch frames for M07–M12 are not published as separate screens in the project; implemented from **M06 Staff Controls** CTAs + product rules.
2. HQ `hq/member-detail.ejs` not restyled in this phase (branch-admin primary).
3. Ministry / pastoral notes panels from M06 Stitch chrome omitted (non-functional / later domains).

BB_V204_MEMBER_ADMIN_PROFILE_PASS
