# Batch 17A — HQ Members Oversight

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/members` directory presentation only. **Registrations not started.** Member detail chrome unchanged.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 72), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_16C_HQ_BRANCH_DIRECTORY.md`](./BATCH_16C_HQ_BRANCH_DIRECTORY.md), [`BATCH_12C_BRANCH_MEMBERS.md`](./BATCH_12C_BRANCH_MEMBERS.md)

## 1. Canonical Stitch screen IDs

No dedicated HQ members Stitch pair exists (map order 72 = `STITCH_MISSING`). Canonical directory chrome reused from branch member directory:

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop directory | `28-branch-member-directory-desktop` | `3dae337c97e242049670749c2b1ab09d` |
| Mobile directory | `28-branch-member-directory-mobile` | `e90963b00bcf41368d089053a3a5db07` |

Marker: `data-bb-stitch-members="28-branch-member-directory"` (plus `data-bb-hq-member-directory="1"`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/hq/members.ejs` | Stitch directory: search/status/branch filters, status chips, desktop table, mobile cards, empty/no-results, branch selector panel |
| `public/blessboard/v5/hq-admin.css` | Directory layout (`?v=32`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-member-registration.test.js` | HQ directory markers, filters, no-results, cross-branch visibility, church-scope privacy |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ members structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 72 Batch 17A note (members only) |
| `docs/gui/BATCH_17A_HQ_MEMBERS.md` | This document |

**Unchanged:** `listChurchMembersForManager`, GET `/hq/members` handler, query params (`q`, `status`, `branch`, `page`), church scoping, CSRF/sessions, member detail (`member-detail.ejs`), `/hq/registrations*`.

## 3. Visible fields (directory rows)

| Field | Source | Notes |
|-------|--------|-------|
| Legal name | `firstName`, `lastName` | Required display |
| Preferred name | `preferredName` | When present |
| Branch | `branchDisplayName`, `branchKey` | Public key only — no branch UUID |
| Phone / email | `phoneDisplay`, `emailDisplay` | Display-only |
| Membership | `membershipStatus` | Labelled |
| Account status | `status` | Status chip |
| Primary flag | `isPrimary` | Tiny chip when true |
| Joined (mobile meta) | `joinedAt` / `createdAt` | Card meta only |
| Real total | `total` | Badge + pager meta |

## 4. Filters preserved

| Control | Param | Notes |
|---------|-------|-------|
| Search | `q` | Name, email, or phone (existing) |
| Status select | `status` | active / pending / inactive / suspended / archived |
| Status chips | `status` | Same values + All; preserves `q` and `branch` |
| Branch select | `branch` | Active church branches by public key; resolved via church ownership |
| Clear | — | Link back to `/hq/members` |
| Pagination | `page` | Previous/Next when `totalPages > 1`; preserves filters |

No new sort query param (service order remains `last_name`, `first_name`, `id`).

## 5. Branch selector context

| Behavior | Detail |
|----------|--------|
| Panel | `data-bb-branch-selector-panel="1"` with shared `branch-selector` partial |
| List source | Same church-scoped `branches` array already passed to the page |
| Open path | Unchanged `/hq/branches/:key` → branch-admin when authorized |

## 6. Actions preserved

| Action | Behavior |
|--------|----------|
| View | Link to `/hq/members/:id` (desktop + mobile) |
| Registration oversight | Ghost link to `/hq/registrations` (existing route; not restyled in this batch) |

No bulk select, export, demographic analytics, messaging, or member edit.

## 7. Mobile treatment

| Surface | Behavior |
|---------|----------|
| `<900px` | Card list (`data-bb-member-cards`); table hidden |
| `≥900px` | Desktop table (`data-bb-member-table`); cards hidden |
| Status chips | Horizontal scroll on narrow viewports; wrap on desktop |

## 8. Privacy safeguards

- Does not render `churchId`, `branchId`, `email_normalized`, `phone_normalized`, or `user_id`
- Directory uses display contact fields only
- Church UUID asserted absent in HTTP tests
- Cross-tenant directory/detail does not expose another church’s members
- Branch filter rejects keys outside the authorized church (`404`)
- Branch admins cannot open `/hq/members` (role gate)

## 9. Unsupported Stitch / product chrome omitted

- Dedicated HQ members Stitch pair (none exists)
- Exports, bulk actions, demographic charts
- Member create/edit from directory
- Fabricated member counts beyond live `total`

## 10. Empty states

| State | Marker | When |
|-------|--------|------|
| Catalog empty | `data-bb-member-empty="catalog"` | No rows and no filters |
| No results | `data-bb-member-empty="no-results"` | No rows with active filters |

## 11. Verification

- `node --test tests/blessboard-member-registration.test.js` (HQ members + cross-branch)
- `node --test tests/blessboard-v5-a11y-structure.test.js` (structure)
- stylelint on changed CSS only
- `git diff --check`

## 12. Suggested commit message

```
feat(gui): HQ members oversight Stitch directory (Batch 17A)

Match church-wide member directory to Stitch 28 desktop/mobile chrome with
branch filters, cards/table, pagination, and privacy-safe rows. Registrations
unchanged.
```
