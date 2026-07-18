# Batch 12B — Branch admin registration detail / review

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/registrations/:id` presentation only. **Members not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 38), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_12A_BRANCH_REGISTRATIONS.md`](./BATCH_12A_BRANCH_REGISTRATIONS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Dedicated registration detail desktop | — | **No dedicated pair** (not in inventory) |
| Dedicated registration detail mobile | — | **No dedicated pair** |
| Related queue (canonical context) | `26-branch-member-verification-queue-desktop` | `87fe9bb70b79434e88b91e0fd877d238` |
| Related queue (canonical context) | `26-branch-member-verification-queue-mobile` | `d352ed076bbe4fabb1ad6f5ef66c0a25` |
| Identity layout cue | `27-branch-member-profile-desktop` / `mobile` | `5e5985a0…` / `b3fbd9e2…` |

Detail composition uses Sacred Modernity + queue/profile identity cues inside the Branch Admin shell. Marker: `data-bb-stitch-registration-detail="26-branch-member-verification-queue"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/branch-admin/registration-detail.ejs` | Applicant summary, submitted details, status timeline, review panel + confirm modals |
| `public/blessboard/v5/branch-admin.css` | Detail layout (`?v=16`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-member-registration.test.js` | Detail structure + privacy assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Detail a11y/structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 38 Batch 12B note |
| `docs/gui/BATCH_12B_BRANCH_REGISTRATION_DETAIL.md` | This document |

**Unchanged:** GET detail / POST approve / POST reject handlers, CSRF, validation, branch scoping, field names (`review_notes`, `_csrf`), Members pages, queue list (aside from shared CSS bump).

## 3. Fields displayed (V5-supplied only)

| Field | Source | Notes |
|-------|--------|-------|
| Legal / preferred name | `firstName`, `lastName`, `preferredName` | Summary + submitted details |
| Email / phone | `emailDisplay`, `phoneDisplay` | Display values only |
| Status | `status` | Chip + timeline |
| Submitted / reviewed | `createdAt`, `reviewedAt` | |
| Branch label | `branchDisplayName` / `branchKey` | When present |
| Linked member | `memberId` | Link to members profile when approved |
| Internal notes | `reviewNotes` | Closed registrations only |

## 4. Review actions preserved

| Action | Target | Confirmation |
|--------|--------|--------------|
| Approve | `POST …/approve` | Modal + Confirm approve |
| Reject | `POST …/reject` | Modal + Confirm reject |
| Internal notes | `review_notes` | Shared textarea → hidden on submit |

No new “mark under review” HTTP route was added (service helper exists; no V5 route today).

## 5. Status history

Timeline built only from stored timestamps:

1. Submitted (`createdAt`)
2. In review (`updatedAt`) when status is `under_review` and not solely a final decision
3. Decision (`reviewedAt`) for approved / rejected / withdrawn

No fabricated audit actors, document checks, or messaging events.

## 6. Privacy safeguards

- Does not render `churchId`, `branchId`, `email_normalized`, `phone_normalized`
- Does not invent identity documents, scores, or applicant messaging
- Church UUID asserted absent in tests
- Internal notes remain admin-only copy

## 7. Unsupported Stitch / product chrome omitted

- Identity document / home visitation / background-check checklist
- Attendance / volunteer / request metrics
- Profile photo upload
- Suspend / Add Note / Verify Member product buttons beyond approve/reject
- Messaging the applicant

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-registration` | **14/14 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **46/46 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (75 hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

1. No dedicated Stitch registration-detail desktop/mobile pair.
2. Members directory / member profile polish not started.
3. “Mark under review” service is not exposed as a branch-admin POST route.

## 10. Suggested commit message

```
Polish branch-admin registration review detail without inventing verification chrome.
```
