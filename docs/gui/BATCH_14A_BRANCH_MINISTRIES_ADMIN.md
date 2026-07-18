# Batch 14A — Branch admin ministries management

**Date:** 2026-07-18  
**Scope:** Branch Admin (shared content-admin) **ministries list + search + inline create/edit presentation only**. Events not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 41), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_13D_BRANCH_PUBLIC_PAGE_EDITOR.md`](./BATCH_13D_BRANCH_PUBLIC_PAGE_EDITOR.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `29-branch-ministries-directory-desktop` | `58c96b4c5b554e6991fc080c63783b6c` |
| Mobile | `29-branch-ministries-directory-mobile` | `526c14042cb045fd8c2cfcb568e2c8ae` |

Markers: `data-bb-ministries-admin="1"`, `data-bb-stitch-ministries="29-branch-ministries-directory"`.

Stitch shows leader/member KPIs, export, and departments chrome; V5 implements the **existing ministry entity list + forms** with directory chrome — real ministry fields only.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/content-admin/entities.ejs` | Ministries management header, search/filter, status chips, desktop table, mobile cards, empty states, create/edit panels |
| `views/blessboard/v5/content-admin/entity-fields.ejs` | Ministry detail/media/publication sections; publish-confirm wrap |
| `src/blessboard/http/contentAdminRoutes.js` | Pass optional `q` + `status` query locals for presentation filtering only |
| `public/blessboard/v5/branch-admin.css` | Entities/ministries layout (`?v=24`) |
| `public/blessboard/v5/hq-admin.css` | Shared entities styles (`?v=20`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-content-admin.test.js` | List/editor, create/update/publish, CSRF, search, scope assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Ministries structure assertions; shell `?v=24` / `?v=20` |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 41 PARTIAL note; order 44 remains PLACEHOLDER |
| `docs/gui/BATCH_14A_BRANCH_MINISTRIES_ADMIN.md` | This document |

**Unchanged:** `createMinistry` / `updateMinistry` services, CSRF validation, optimistic concurrency, publish confirmation enforcement, media upload endpoints, scoping/authz, hard-delete prohibition. Events Stitch polish not started.

## 3. Supported actions and fields

### List — `GET …/ministries`

| Control | Param | Notes |
|---------|-------|-------|
| Search | `q` | Filters loaded items by name/summary/description/meeting/contact (presentation only) |
| Status | `status` | `draft` / `published` / `archived` chips + select |
| Preview | link | Existing `…/preview/ministries` |
| New ministry | anchor | `#bb-ca-entity-create` |

### Create / update — `POST …/ministries`

| Control | Name | Notes |
|---------|------|-------|
| CSRF | `_csrf` | Required |
| Action | `action` | `create` / `update` |
| Optimistic lock | `expected_updated_at` | Update only |
| Item id | `item_id` | Update only |
| Name | `name` | Required |
| Summary / description | `summary`, `description` | Plain text |
| Meeting / contact | `meeting_day`, `contact_email` | Existing |
| Media | `image_url` | HTTPS or uploaded via existing media picker (`visibility: public`) |
| Order / status | `sort_order`, `status` | `draft` / `published` / `archived` |
| Publish confirm | `confirm_publish` | Required when status is `published` (UI toggles required; server still enforces) |

## 4. Omitted functionality

| Omitted | Reason |
|---------|--------|
| Total Members / Active Leaders / campaign KPI cards | Fabricated Stitch metrics |
| Leader column / avatars / leader assignment | Not on ministry admin DTO / routes |
| Member counts / meeting statistics | Not inventable |
| Departments, chat, duty roster | Not in V5 product |
| Export / bulk actions | No V5 routes |
| Dedicated ministry profile route | Order 42 Stitch — still PLACEHOLDER (inline editors remain) |
| Events management Stitch polish | Explicitly out of scope for 14A |

## 5. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥900px` | Desktop ministries table; mobile cards hidden |
| `<900px` | Card list; table panel hidden; filter chips scroll |
| `≥700px` | Two-column field grids |

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:content-admin` | **12/12 pass** |
| `npm run test:blessboard:a11y-structure` | **53/53 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 7. Remaining gaps

1. Ministry profile Stitch pair (order 42) still PLACEHOLDER — no separate detail route.
2. Events management (order 44) not started.
3. Shell search / notification icons from Stitch remain out of product scope.

## 8. Suggested commit message

```
Polish branch-admin ministries management to Stitch list and editor chrome.
```
