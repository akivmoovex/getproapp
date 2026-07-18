# Batch 18A — HQ Public Content oversight

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/content` (+ `/hq/content/b/:branchKey`) **overview / oversight presentation only**. Attendance reports follow in Batch 18B.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_17D_HQ_ANNOUNCEMENT_EDITOR.md`](./BATCH_17D_HQ_ANNOUNCEMENT_EDITOR.md), [`BATCH_13C_BRANCH_PUBLIC_CONTENT_OVERVIEW.md`](./BATCH_13C_BRANCH_PUBLIC_CONTENT_OVERVIEW.md)

## 1. Canonical Stitch screen IDs

No dedicated HQ website/content Stitch pair exists (order 70 is org templates — **not** implemented). Canonical pair reused from branch website editor:

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `34-branch-website-editor-desktop` | `3f3160664d91423d80cb4ba81e2af6c4` |
| Mobile | `34-branch-website-editor-mobile` | `f2bb5e794f074a1aa3d248a2fe54ddeb` |

Markers: `data-bb-stitch-content="34-branch-website-editor"` (+ `data-bb-hq-content="1"`).

Stitch shows a full website builder; V5 implements an **oversight hub** of real modules only (no builder canvas, theme, domain, or SEO analytics).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/content-admin/index.ejs` | HQ oversight chrome: scope panel, status/search filters, branch table/cards, archived summary, unavailable modules |
| `src/blessboard/http/contentAdminRoutes.js` | Pass existing `q` / `status` query locals into index only — filter in view over loaded pages |
| `public/blessboard/v5/hq-admin.css` | HQ content oversight styles (`?v=36`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-content-admin.test.js` | HQ oversight markers, filters, module links, branch scope |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ content structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | HQ Public Content Batch 18A note |
| `docs/gui/BATCH_18A_HQ_CONTENT.md` | This document |

**Unchanged:** page/section/entity editor routes and services, publish confirmation, CSRF, media upload APIs, church/branch scope resolution, central page editing behavior.

## 3. Modules shown (V5-supported only)

### Public pages (from `listAdminPages`)

| Module | Link | Status source |
|--------|------|---------------|
| Home, About, Leadership, Ministries, Events, Sermons, Contact, Giving | `basePath/pages/:pageKey` | Real `page.status` |
| Preview | `basePath/preview/:pageKey` | Existing preview route |

### Structured content

| Module | Link |
|--------|------|
| Leadership | `basePath/leadership` |
| Ministries | `basePath/ministries` |
| Events | `basePath/events` |
| Sermons | `basePath/sermons` |
| Contact channels | `basePath/contact` |
| Giving methods | `basePath/giving` |

### Summary counts

Real page totals only: pages in scope, published, draft, archived — derived from the same `pages` array. No completion %, engagement, or unsaved-change counters.

## 4. Editing scope preserved

| Scope | Path | Behavior |
|-------|------|----------|
| Church-wide | `/hq/content` | Central edit of church-wide pages/entities; branch list → `/hq/content/b/:key` |
| HQ branch | `/hq/content/b/:branchKey` | Branch-scoped pages/entities; link back to church-wide |
| Branch admin | `/branch-admin/content` | Unchanged overview (HQ-controlled panel retained) |

Filters (`q`, `status`) are presentation-only over already-loaded pages — no new content queries.

## 5. Unavailable / omitted

| Kind | Treatment |
|------|-----------|
| Theme & appearance | `data-bb-content-unavailable="theme"` |
| Custom domain | `data-bb-content-unavailable="domain"` |
| SEO analytics / SEO tools | `data-bb-content-unavailable="seo"` |
| Drag-and-drop website builder | `data-bb-content-unavailable="builder"` |
| Organization templates | `data-bb-content-unavailable="templates"` |
| Service times / branding | Existing unavailable rows |
| Fabricated completion % | Explicitly omitted in card meta copy |

Order 70 Stitch org-templates screens are **not** mapped to this route.

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `<700px` | Single-column page/module cards; full-width actions |
| `≥700px` | Two-column page cards |
| `≥900px` | Branch directory table; cards hidden |
| `<900px` | Branch directory cards; filter actions stacked |
| `≥1100px` | Three-column structured-content cards |

## 7. Verification

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-content-admin.test.js` | **14/14 pass** |
| `node --test tests/blessboard-v5-a11y-structure.test.js` | **80/80 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
feat(gui): HQ public content oversight presentation (Batch 18A)

Match /hq/content to Stitch 34 website-editor chrome with scope panel,
publication filters, and real page summaries. No theme, domain, SEO, or
builder. Attendance reports unchanged.
```
