# Batch 17B — HQ Registrations Oversight

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/registrations` queue presentation only. **Announcements not started.** Registration detail chrome unchanged (still read-only).  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 72), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_17A_HQ_MEMBERS.md`](./BATCH_17A_HQ_MEMBERS.md)

## 1. Canonical Stitch screen IDs

No dedicated HQ registrations Stitch pair exists. Canonical queue chrome reused from branch verification queue:

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop queue | `26-branch-member-verification-queue-desktop` | `87fe9bb70b79434e88b91e0fd877d238` |
| Mobile queue | `26-branch-member-verification-queue-mobile` | `d352ed076bbe4fabb1ad6f5ef66c0a25` |

Marker: `data-bb-stitch-registrations="26-branch-member-verification-queue"` (plus `data-bb-hq-registration-queue="1"`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/hq/registrations.ejs` | Stitch queue: search/status/branch filters, status chips, desktop table, mobile cards, empty/no-results, checklist, branch selector |
| `public/blessboard/v5/hq-admin.css` | Queue layout (`?v=33`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-member-registration.test.js` | HQ queue markers, filters, no-results, cross-branch visibility, church-scope privacy, no approve/reject |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ registrations structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 72 Batch 17B note |
| `docs/gui/BATCH_17B_HQ_REGISTRATIONS.md` | This document |

**Unchanged:** `listMemberRegistrations`, GET `/hq/registrations` handler, query params (`q`, `status`, `branch`, `page`), church scoping, CSRF/sessions, `registration-detail.ejs` (still no approve/reject), `/hq/members*`, announcements.

## 3. Visible fields (queue rows)

| Field | Source | Notes |
|-------|--------|-------|
| Legal name | `firstName`, `lastName` | Required display |
| Preferred name | `preferredName` | When present |
| Branch | `branchDisplayName`, `branchKey` | Public key only — no branch UUID |
| Phone / email | `phoneDisplay`, `emailDisplay` | Display-only |
| Submitted | `createdAt` | Long format desktop; short on cards |
| Status | `status` | Status chip |
| Real total | `total` | Badge + pager meta — not fabricated KPIs |

## 4. Filters preserved

| Control | Param | Notes |
|---------|-------|-------|
| Search | `q` | Name, email, or phone (existing) |
| Status select | `status` | submitted / under_review / approved / rejected / withdrawn |
| Status chips | `status` | Same values + All; preserves `q` and `branch` |
| Branch select | `branch` | Active church branches by public key; resolved via church ownership |
| Clear | — | Link back to `/hq/registrations` |
| Pagination | `page` | Previous/Next when `totalPages > 1`; preserves filters |

## 5. Actions preserved

| Action | Behavior |
|--------|----------|
| Review | Link to `/hq/registrations/:id` (desktop + mobile) — read-only detail |
| Member directory | Ghost link to `/hq/members` |
| Branch open | Shared selector → `/hq/branches/:key` when authorized |

**Not present (and not added):** HQ approve/reject POST forms, CSRF action buttons, bulk select, export.

## 6. Branch selector context

| Behavior | Detail |
|----------|--------|
| Panel | `data-bb-branch-selector-panel="1"` with shared `branch-selector` partial |
| Purpose | Enter branch admin to perform approve/reject when authorized |
| List source | Same church-scoped `branches` array already passed to the page |

## 7. Mobile treatment

| Surface | Behavior |
|---------|----------|
| `<900px` | Card list (`data-bb-reg-cards`); table hidden |
| `≥900px` | Desktop table (`data-bb-reg-table`); cards hidden |
| Status chips | Horizontal scroll on narrow viewports; wrap on desktop |

## 8. Privacy safeguards

- Does not render `churchId`, `branchId`, `email_normalized`, `phone_normalized`, or `user_id`
- Queue uses display contact fields only
- Church UUID asserted absent in HTTP tests
- Cross-tenant queue/detail does not expose another church’s registrations
- Branch filter rejects keys outside the authorized church (`404`)
- Branch admins cannot open `/hq/registrations` (role gate)

## 9. Unsupported Stitch / product chrome omitted

- Dedicated HQ registrations Stitch pair (none exists)
- HQ approve/reject actions (branch-only)
- Exports, bulk actions, fabricated pending/goal KPIs
- Announcements (not started)

## 10. Empty states

| State | Marker | When |
|-------|--------|------|
| Catalog empty | `data-bb-reg-empty="catalog"` | No rows and no filters |
| No results | `data-bb-reg-empty="no-results"` | No rows with active filters |

## 11. Verification

- `node --test tests/blessboard-member-registration.test.js`
- `node --test tests/blessboard-v5-a11y-structure.test.js`
- stylelint on changed CSS only
- `git diff --check`

## 12. Suggested commit message

```
feat(gui): HQ registrations oversight Stitch queue (Batch 17B)

Match church-wide registration queue to Stitch 26 desktop/mobile chrome with
branch filters, cards/table, pagination, and read-only review links. No HQ
approve/reject. Announcements unchanged.
```
