# Batch 14C — Branch admin sermons management

**Date:** 2026-07-18  
**Scope:** Branch Admin (shared content-admin) **sermons list + filters + inline create/edit presentation only**. Attendance not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 45), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_14B_BRANCH_EVENTS_ADMIN.md`](./BATCH_14B_BRANCH_EVENTS_ADMIN.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Dedicated branch sermons admin | — | **STITCH_MISSING** (no desktop/mobile pair in project) |
| Visual reference (public desktop) | `06-public-sermons-desktop-v2 (Populated)` | `4f4995dc4ec84354ac80ed022a767ef3` |
| Visual reference (public mobile) | `06-public-sermons-mobile-v2 (Populated)` | `96b380d4e47649c1bd7f05cabe9c3a1d` |
| Shared chrome | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Markers: `data-bb-sermons-admin="1"`, `data-bb-stitch-sermons="sermons-admin"`.

Admin chrome follows the events/ministries entity pattern with sermon card metadata (title, speaker, preached date, media/resource links) inspired by public sermons cards — real fields only.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/content-admin/entities.ejs` | Sermons management header, search, status chips, card grid, empty states, create/edit, unavailable notes |
| `views/blessboard/v5/content-admin/entity-fields.ejs` | Sermon details / preached date / media & resources / publication; ISO `preached_at`; no `sort_order` |
| `public/blessboard/v5/branch-admin.css` | Sermon card grid + field hint (`?v=26`) |
| `public/blessboard/v5/hq-admin.css` | Shared sermon card styles (`?v=22`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-content-admin.test.js` | Sermons list/editor, create/update/publish, media HTTPS validation, CSRF, scope |
| `tests/blessboard-v5-a11y-structure.test.js` | Sermons structure assertions; shell `?v=26` / `?v=22` |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 45 Sermons management (STITCH_MISSING) |
| `docs/gui/BATCH_14C_BRANCH_SERMONS_ADMIN.md` | This document |

**Unchanged:** `createSermon` / `updateSermon` services, CSRF, optimistic concurrency, publish confirmation, media upload for `resource_url`, HTTPS validation for media/resource URLs, scoping/authz. List ordering remains `preached_at` descending.

## 3. Data fields and actions

### List — `GET …/sermons`

| Control | Param | Notes |
|---------|-------|-------|
| Search | `q` | Filters by title / speaker / summary / media URL / resource URL |
| Status | `status` | `draft` / `published` / `archived` |
| Preview | link | Existing `…/preview/sermons` |
| Add sermon | anchor | `#bb-ca-entity-create` (+ dashed create card) |

Cards show speaker, preached datetime, summary snippet, and external Listen/Watch/Notes/Resource labels derived from URL shape only (no view counts).

### Create / update — `POST …/sermons`

| Control | Name | Notes |
|---------|------|-------|
| CSRF | `_csrf` | Required |
| Action | `action` | `create` / `update` |
| Optimistic lock | `expected_updated_at` | Update only |
| Item id | `item_id` | Update only |
| Title / speaker | `title`, `speaker_name` | Required |
| Preached at | `preached_at` | ISO datetime; drives list order |
| Summary | `summary` | Optional |
| Media | `media_url` | HTTPS external link only (existing validation) |
| Resource | `resource_url` | HTTPS or uploaded media path (existing upload + validation) |
| Status | `status` | `draft` / `published` / `archived` |
| Publish confirm | `confirm_publish` | Required when status is `published` |

## 4. Supported media

| Field | Allowed | Not supported |
|-------|---------|---------------|
| `media_url` | `https://…` external audio/video/page links | Hosting, embeds, iframes, transcoding |
| `resource_url` | `https://…` or uploaded `/_bb/media/…` path via existing media picker | Series packages, livestream ingest |

## 5. Unsupported / omitted

| Omitted | Reason |
|---------|--------|
| Audio hosting / video transcoding / livestreaming | Not in V5 product |
| Views, downloads, engagement metrics | Fabricated in some Stitch public chrome; not shown |
| Series / scripture / duration | Not on sermon DTO |
| `sort_order` | Not a sermon field; order is `preached_at DESC` |
| Attendance polish | Explicitly out of scope for 14C |

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `<700px` | Single-column sermon cards |
| `≥700px` | Two-column card grid |
| `≥1100px` | Three-column card grid |
| All | Status chips; stacked filters on narrow viewports |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:content-admin` | **14/14 pass** |
| `npm run test:blessboard:a11y-structure` | **55/55 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps

1. No dedicated branch-admin Sermons Stitch pair — add when designed.
2. Attendance tracker Stitch polish not started.
3. Leadership / contact / giving entity editors still generic.

## 9. Suggested commit message

```
Polish branch-admin sermons management with card list and media editor chrome.
```
