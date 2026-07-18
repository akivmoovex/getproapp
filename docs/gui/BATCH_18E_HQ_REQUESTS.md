# Batch 18E — HQ Requests oversight

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/requests` (+ `/hq/requests/b/:branchKey`, detail, status, file) **oversight presentation only**. **Audit / Reports follow in Batch 18F.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 57–58, 71d), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_15D_BRANCH_REQUESTS.md`](./BATCH_15D_BRANCH_REQUESTS.md), [`BATCH_18D_HQ_FORMS_RESOURCES.md`](./BATCH_18D_HQ_FORMS_RESOURCES.md)

## 1. Canonical Stitch screen IDs

No dedicated HQ requests Stitch pair. Canonical pairs reused from branch admin (same IDs as Batch 15D):

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop queue | `44-branch-request-workflow-queue-desktop` | `126bfebff1414fc08367039b84587819` |
| Mobile queue | `44-branch-request-workflow-queue-mobile` | `9b6531097eec43fb8ce22115dd170429` |
| Desktop detail | `45-branch-request-details-desktop` | `22fe4b70e55e4be498d7008741147d55` |
| Mobile detail | `45-branch-request-details-mobile` | `9d8f71d056e54d7da7586d88e253af93` |

Markers: `data-bb-stitch-requests="44-branch-request-workflow-queue"` (+ `data-bb-hq-requests="1"`),  
`data-bb-stitch-requests-detail="45-branch-request-details"` (+ `data-bb-hq-request-detail="1"`).

Stitch shows Pending/Goal KPIs, assignment, Export, Urgent, chat, Approve/Reject, and donor/contact cards; V5 HQ shows **existing church-scoped requests and status workflow only**.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/forms-requests/admin-requests.ejs` | HQ oversight chrome: branch table/cards, summary cards, search/status filter, empty/no-results, unavailable rows |
| `views/blessboard/v5/forms-requests/admin-request-detail.ejs` | HQ markers, breadcrumb, privacy copy |
| `src/blessboard/http/formsRequestsAdminRoutes.js` | In-memory `q` filter on subject/category for requests list |
| `public/blessboard/v5/hq-admin.css` | HQ requests branch panel + summary (`?v=40`) |
| `public/blessboard/v5/branch-admin.css` | Shared summary/title-row styles (`?v=33`) |
| Shell partials | CSS cache bumps |
| `tests/blessboard-forms-requests.test.js` | Cross-branch visibility, search/filter, history, privacy, role gate |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ requests structure + CSS versions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 71d Batch 18E |
| `docs/gui/BATCH_18E_HQ_REQUESTS.md` | This document |

**Unchanged:** `listMemberRequests` / `getMemberRequest` / `updateMemberRequestStatus`, transitions, CSRF, attachment download authz, Forms/Resources, Audit, Reports.

## 3. Actions preserved

| Action | Surface | Notes |
|--------|---------|-------|
| Church-wide list | `GET /hq/requests` | Existing church-scoped list when `branchId` null |
| Branch open | `/hq/requests/b/:key` | Branch panel table/cards |
| Review detail | `GET …/requests/:id` | Message, truncated memberRef, history |
| Update status | `POST …/requests/:id/status` | Existing transitions + note + `internal_only` |
| Private attachment | `GET …/requests/:id/file` | Authorized download; private cache headers |
| Filter | `q`, `status` | Status via service; `q` in-memory on subject/category |
| Status tabs | Same query params | All / submitted / in_review / resolved / closed |

## 4. Privacy safeguards

- List omits request **message** body; detail shows message for authorized admins only
- Truncated `memberRef` (last 8 of member id) — never full member UUID
- No email, phone, donor badges, or profile links
- Church UUID omitted from HTML
- Branch admins denied `/hq/requests`
- Attachments remain private authenticated downloads

## 5. Omitted / unavailable controls

| Kind | Treatment |
|------|-----------|
| Queue KPI / trend metrics | `data-bb-req-unavailable-row="metrics"` |
| Assignment queues / SLA timers / chat | `…="assignment"` |
| Escalation automation | `…="escalation"` |
| Donor / contact directories on list | `…="privacy"` |
| Detail chat / Approve-Reject | Detail unavailable rows |
| Audit / Reports HQ chrome | **Batch 18F** |

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥900px` | Branch directory table; request table; cards hidden |
| `<900px` | Branch cards; request cards; filter actions stacked |

## 7. Verification

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-forms-requests.test.js` | **10/10 pass** |
| `node --test tests/blessboard-v5-a11y-structure.test.js` | **71/71 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css public/blessboard/v5/branch-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
feat(gui): HQ requests oversight (Batch 18E)

Match /hq/requests to branch request-queue Stitch chrome with branch
panels, status filters, and privacy-safe lists. No SLA, chat, or Audit.
```
