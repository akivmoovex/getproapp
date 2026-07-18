# Batch 13C — Branch admin public content overview

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/content` **overview presentation only**. Individual page/section/entity editors not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 46), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_13B_BRANCH_ANNOUNCEMENT_EDITOR.md`](./BATCH_13B_BRANCH_ANNOUNCEMENT_EDITOR.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `34-branch-website-editor-desktop` | `3f3160664d91423d80cb4ba81e2af6c4` |
| Mobile | `34-branch-website-editor-mobile` | `f2bb5e794f074a1aa3d248a2fe54ddeb` |

Marker: `data-bb-stitch-content="34-branch-website-editor"`.

Stitch is a full website-builder frame; V5 implements an **overview hub** of real modules only (no builder chrome).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/content-admin/index.ejs` | Page cards, entity modules, HQ-controlled + unavailable states, real status badges |
| `public/blessboard/v5/branch-admin.css` | Overview card layout (`?v=21`) |
| `public/blessboard/v5/hq-admin.css` | Shared overview styles (`?v=17`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-content-admin.test.js` | Overview markers, link targets, anti-metric assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Overview structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 46 Batch 13C note |
| `docs/gui/BATCH_13C_BRANCH_PUBLIC_CONTENT_OVERVIEW.md` | This document |

**Unchanged:** `GET /branch-admin/content` (and HQ mounts), `listAdminPages`, `provisionEmptyPublicPages`, page/section/entity editor routes, media upload APIs, CSRF, scoping.

## 3. Modules shown (existing V5 routes only)

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

Real page totals only: pages in scope, published count, draft count — derived from the same `pages` array. No completion %, engagement, or unsaved-change counters.

## 4. Unavailable / HQ-controlled modules

| Kind | Examples | Treatment |
|------|----------|-----------|
| HQ-controlled (branch shell) | Church-wide pages, org branding | Dashed panel `data-bb-content-hq-controlled` |
| Product unavailable | Branding editor, service times, theme, custom domain, SEO, drag-and-drop builder | `data-bb-content-unavailable="…"` rows — no inventable links |

## 5. Backend confirmation

- Still uses `provisionEmptyPublicPages` + `listAdminPages` with church + branch (or HQ church-wide / branch) scope.
- No new queries, metrics, schema, or auth changes.
- Preview remains the existing content-admin preview route (already supported).

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `<700px` | Single-column cards; full-width actions |
| `≥700px` | Two-column page/module cards |
| `≥1100px` | Three-column structured-content cards |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:content-admin` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **51/51 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps

1. Individual page / section / entity editor Stitch polish deferred.
2. No service-times or branding product modules in V5.
3. Media remains editor-embedded (no dedicated library screen).

## 9. Suggested commit message

```
Polish branch-admin public content overview to Stitch module cards.
```
