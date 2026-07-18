# Batch 10C — Member Requests

**Date:** 2026-07-18
**Scope:** Member Submit Online Request + My Request Status (list + detail). **Giving not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 33–34), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_10B_MEMBER_FORMS.md`](./BATCH_10B_MEMBER_FORMS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Submit Online Request | `21-member-submit-online-request-desktop` | `2cfd58a5ea094831a3a44eed73c44165` |
| Mobile Submit Online Request | `21-member-submit-online-request-mobile` | `196260bada8445d5b107f4be552540dc` |
| Desktop Request Status | `22-member-request-status-desktop` | `530cb58f684646b9b084f45eb2e17e90` |
| Mobile Request Status | `22-member-request-status-mobile` | `6c5f8b31ee394643a69dd7fe01c3e67e` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/forms-requests/member-request-new.ejs` | Stitch chrome, category cards, privacy + next steps (no SLA/upload) |
| `views/blessboard/v5/forms-requests/member-requests.ejs` | Summary counts, filters/search, cards, empty/success |
| `views/blessboard/v5/forms-requests/member-request-detail.ejs` | Success state, status chips, member-visible timeline |
| `src/blessboard/http/formsRequestsMemberRoutes.js` | Present labels/chips; filter/search; live summary |
| `public/blessboard/v5/member-portal.css` | Request panel / summary / cards / timeline (`?v=17`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-forms-requests.test.js` | Submit, CSRF, validation, ownership, history privacy, filters |
| `tests/blessboard-v5-a11y-structure.test.js` | Requests structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 33–34 notes (Batch 10C) |
| `docs/gui/BATCH_10C_MEMBER_REQUESTS.md` | This document |

**Unchanged:** `createMemberRequest` / `listMemberRequests` / `getMemberRequest` / `updateMemberRequestStatus`, allowlisted categories & statuses, CSRF on POST, ownership (`forMember` + `memberId`), member-visible history filtering, private attachment download auth.

## 3. Request fields (preserved)

| Field | Source | Notes |
|-------|--------|-------|
| `category` | POST radio | Allowlisted: `prayer`, `pastoral`, `practical`, `other` |
| `subject` | POST text | Required, max 200 |
| `message` | POST textarea | Required, max 5000 |
| `_csrf` | Hidden | Required on POST |
| `media_asset_id` | Optional POST (not in GUI) | Existing private-media path only; no upload UI |

POST target remains `POST /member/requests` → 303 to `/member/requests/:id?saved=1`.

## 4. Status behavior (real V5 only)

| Status | Member label | Chip |
|--------|--------------|------|
| `submitted` | Pending review | `--pending` |
| `in_review` | In review | `--open` |
| `resolved` | Resolved | `--active` |
| `closed` | Closed | `--request` |

Summary cards use live counts from the member’s own list: Active (`submitted` + `in_review`), Pending, Resolved, Total.

History on detail shows member-visible notes only (internal staff notes omitted).

## 5. Filters / search

| Filter | Behavior |
|--------|----------|
| `all` | Full own-request list |
| `active` | `submitted` + `in_review` |
| `resolved` | Resolved only |
| `closed` | Closed only |
| `q` | Substring on subject / message / category label / status label |

## 6. Security confirmation

| Concern | Behavior |
|---------|----------|
| Ownership | List/detail/file scoped to session `memberId`; other members get 403/404 |
| CSRF | POST requires valid token; bad token → 403 |
| Validation | Unsupported category / empty subject/message → 400 re-render |
| Internal notes | `memberVisible: false` history never rendered to members |
| Attachments | Download only for owner + private active media; public media path unchanged |

## 7. Unsupported Stitch elements omitted

- Urgent / Confidential checkbox
- Attachment upload dropzone (JPG/PNG/PDF Max 5MB)
- Fabricated categories (Baptism, Facility Use, Administration, …)
- Fabricated statuses (In Progress, Completed) and REQ-YYYY-XXX IDs
- SLA promises (24–48 hours) / email notification guarantees
- Crisis hotline CTA / chat
- Fabricated queue metrics or pagination totals

## 8. Empty and success states

| State | Marker |
|-------|--------|
| No requests yet | `data-bb-requests-empty="catalog"` |
| Filter/search miss | `data-bb-requests-empty="no-results"` |
| Submit success (detail) | `data-bb-request-success="1"` |
| Empty history | `data-bb-request-history-empty="1"` |

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:forms-requests` | **10/10 pass** (submit, CSRF, validation, ownership, history privacy, filters) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **40/40 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex token warnings only) |
| `git diff --check` | **clean** |

## 10. Suggested commit message

```
Polish member request submit and status views with real history.
```
