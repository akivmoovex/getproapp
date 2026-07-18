# Batch 15D — Branch admin requests

**Date:** 2026-07-18  
**Scope:** Branch Admin **request workflow queue and detail/history presentation only**. Parity audit not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 57–58), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_15C_BRANCH_FORMS.md`](./BATCH_15C_BRANCH_FORMS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop queue | `44-branch-request-workflow-queue-desktop` | `126bfebff1414fc08367039b84587819` |
| Mobile queue | `44-branch-request-workflow-queue-mobile` | `9b6531097eec43fb8ce22115dd170429` |
| Desktop detail | `45-branch-request-details-desktop` | `22fe4b70e55e4be498d7008741147d55` |
| Mobile detail | `45-branch-request-details-mobile` | `9d8f71d056e54d7da7586d88e253af93` |

Markers: `data-bb-stitch-requests="44-branch-request-workflow-queue"`, `data-bb-stitch-requests-detail="45-branch-request-details"`.

Stitch shows Pending/Goal KPIs, assignment, Export, Urgent filters, chat, Approve/Reject, and donor/contact cards; V5 shows **real branch requests and status workflow only**.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/forms-requests/admin-requests.ejs` | Queue chrome, status tabs, desktop table + mobile cards, empty/no-results, privacy + unavailable notes |
| `views/blessboard/v5/forms-requests/admin-request-detail.ejs` | Detail header, message, status form, history timeline, privacy notes |
| `public/blessboard/v5/branch-admin.css` | Request queue/detail layout (`?v=30`) |
| `public/blessboard/v5/hq-admin.css` | Shared request styles (`?v=26`) |
| Shell partials | CSS cache bumps |
| `tests/blessboard-forms-requests.test.js` | Stitch markers, no-results, privacy omissions |
| `tests/blessboard-v5-a11y-structure.test.js` | Requests structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 57–58 notes |
| `docs/gui/BATCH_15D_BRANCH_REQUESTS.md` | This document |

**Unchanged:** `listMemberRequests` / `getMemberRequest` / `updateMemberRequestStatus`, transitions, CSRF, branch scoping, private attachment download, Forms routes/views.

## 3. Statuses and actions preserved

| Status | Label |
|--------|-------|
| `submitted` | Submitted |
| `in_review` | In review |
| `resolved` | Resolved |
| `closed` | Closed |

| Transition (existing) | From → To |
|-----------------------|-----------|
| | `submitted` → `in_review`, `closed` |
| | `in_review` → `resolved`, `closed`, `submitted` |
| | `resolved` → `closed`, `in_review` |
| | `closed` → (none) |

| Action | Method / path |
|--------|----------------|
| List + status filter | `GET …/requests?status=` |
| Detail | `GET …/requests/:id` |
| Update status | `POST …/requests/:id/status` (`status`, `note`, `internal_only`, `_csrf`) |
| Private attachment | `GET …/requests/:id/file` |

Categories preserved: `prayer`, `pastoral`, `practical`, `other`.

## 4. Privacy safeguards

| Safeguard | How |
|-----------|-----|
| Truncated member ref | Last 8 chars of member id only (`Member · …`) |
| No contact directory | No email, phone, or profile links |
| No donor badges | Omitted |
| Branch scoping | Existing tenant + branch authorization |
| Private attachments | Authorized download only; `private, no-store` |
| Internal notes | `internal_only` checkbox hides note from member |

## 5. Unsupported Stitch elements omitted

| Omitted | Reason |
|---------|--------|
| Pending 24 / Today's Goal KPI cards | Fabricated |
| My Assigned / Urgent filters | Not in V5 |
| Export | Not supported |
| Priority / Assigned To columns | Not stored |
| Avg processing time / volunteer stats | Fabricated |
| Chat / public correspondence | Not supported |
| Approve / Reject / Request More Info buttons | Not V5 transitions |
| SLA timers / escalation | Not supported |
| Member profile card with contact + donor badge | Privacy |

## 6. Empty states

| State | Marker |
|-------|--------|
| No requests | `data-bb-req-empty="catalog"` |
| Status filter miss | `data-bb-req-empty="no-results"` |
| No history yet | `data-bb-req-history-empty="1"` |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:forms-requests` | **10/10 pass** |
| `npm run test:blessboard:a11y-structure` | **59/59 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
Polish branch-admin request queue and detail to Stitch workflow chrome.
```
