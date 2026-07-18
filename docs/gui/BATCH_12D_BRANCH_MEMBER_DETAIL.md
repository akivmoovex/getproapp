# Batch 12D — Branch admin member detail

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/members/:id` presentation only. **Announcements list started in Batch 13A.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 40), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_12C_BRANCH_MEMBERS.md`](./BATCH_12C_BRANCH_MEMBERS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop profile | `27-branch-member-profile-desktop` | `5e5985a087d049109c49006f99095884` |
| Mobile profile | `27-branch-member-profile-mobile` | `b3fbd9e2eda64a2b998ec0e2a4311229` |

Marker: `data-bb-stitch-member-detail="27-branch-member-profile"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/branch-admin/member-detail.ejs` | Identity summary, contact, membership, account; read-only chips; unavailable tabs |
| `public/blessboard/v5/branch-admin.css` | Detail layout (`?v=18`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-member-registration.test.js` | Detail markers, privacy, wrong-branch, invalid id |
| `tests/blessboard-v5-a11y-structure.test.js` | Detail structure + CSS version assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 40 Batch 12D note |
| `docs/gui/BATCH_12D_BRANCH_MEMBER_DETAIL.md` | This document |

**Unchanged:** `GET /branch-admin/members/:id`, `getBranchMemberForManager`, branch ownership checks. **No POST update/status routes existed; none were invented.**

## 3. Data displayed (route DTO only)

| Field | Source | Section |
|-------|--------|---------|
| Legal name | `firstName`, `lastName` | Summary + Account |
| Preferred name | `preferredName` | When present |
| Account status | `status` | Chip + membership |
| Membership status | `membershipStatus` | Chip + membership |
| Primary flag | `isPrimary` | Chip + membership |
| Email / phone | `emailDisplay`, `phoneDisplay` | Contact (display-only) |
| Joined / updated | `joinedAt`, `createdAt`, `updatedAt` | Membership / summary |
| Login linked | `hasLoginLinked` | Account (boolean only — no `userId`) |
| Branch label | Shell `branchDisplayName` / `churchDisplayName` | Summary + membership |

## 4. Actions preserved

| Action | Behavior |
|--------|----------|
| View profile (from directory) | Existing GET detail |
| Back to directory | Link to `/branch-admin/members` |
| Branch ownership | Unchanged `getBranchMemberForManager` gate |

**No update, status change, suspend, note, or CSRF mutate forms** on this screen (route remains read-only GET).

## 5. Sections / tabs

| Control | Treatment |
|---------|-----------|
| Overview | Active section with real data |
| Attendance / Requests / Notes | Unavailable tab labels (not clickable; no fabricated content) |

Desktop: two-column layout (≥900px). Mobile: stacked panels; tabs scroll horizontally.

## 6. Read-only vs editable

- All profile fields are marked **Read-only** (`bb-ba-chip--readonly`).
- Hint explains member-portal contact edits require a linked login; branch admins cannot edit here.
- No editable form controls are rendered.

## 7. Privacy safeguards

- Does not render `churchId`, `branchId`, `email_normalized`, `phone_normalized`, `user_id` / `userId`
- Contact uses display fields only
- Church UUID asserted absent in HTTP tests
- Wrong-branch / other-tenant access remains 403/404
- Invalid UUID → 404

## 8. Unsupported Stitch chrome omitted

- Suspend / Add Note / Verify Member / Edit / Message / Restrict
- Home address, birthday, member ID codes
- Verification checklist, attendance rate, volunteer hours, giving badges
- Ministry involvement list / Assign to Ministry
- Attendance tables, request history, admin notes, activity feed

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-registration` | **15/15 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **48/48 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (82 hex warnings only) |
| `git diff --check` | **clean** |

## 10. Remaining gaps

1. No branch-admin member update/status POST API in V5 — product decision deferred.
2. Form / detail / preview / publish Stitch polish not started (Batch 13A covered list only).
3. Unavailable tabs are markers only (no deep links to attendance/requests for this member).

## 11. Suggested commit message

```
Polish branch-admin member detail to Stitch read-only profile layout.
```
