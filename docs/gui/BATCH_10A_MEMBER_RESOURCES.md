# Batch 10A — Member Resources & Study

**Date:** 2026-07-18
**Scope:** Member `/member/resources` list + detail presentation only. **Forms not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 31), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_09C_MEMBER_MINISTRIES.md`](./BATCH_09C_MEMBER_MINISTRIES.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Resources / Study | `19-member-resources-study-desktop` | `d1690ab7193d43e38ba9ba97c29d914c` |
| Mobile Resources / Study | `19-member-resources-study-mobile` | `d3232a4f5e0f4d2da610740ca3a8f6b1` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/forms-requests/member-resources.ejs` | Toolbar (All/Files/Info + search), cards, empty/no-results |
| `views/blessboard/v5/forms-requests/member-resource-detail.ejs` | Real type/size/filename; download CTA unchanged |
| `src/blessboard/http/formsRequestsMemberRoutes.js` | Present media meta; filter/search over visible set |
| `src/blessboard/repositories/formsRequestsRepository.js` | `findMediaMeta` includes `size_bytes` |
| `public/blessboard/v5/member-portal.css` | Resource grid / toolbar (`?v=15`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-forms-requests.test.js` | Visibility, filter/search, download auth, anti-fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Resources structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 31 note (Batch 10A) |
| `docs/gui/BATCH_10A_MEMBER_RESOURCES.md` | This document |

**Unchanged:** `listResources` / `getResource` member visibility (`published` + `audience: members`), `GET /member/resources/:id/file` download auth (`loadMediaBytes` with `allowPrivate: true`), CSRF (N/A for GET downloads).

## 3. Resource types & metadata (real V5 only)

| Indicator | Source | When shown |
|-----------|--------|------------|
| Type chip (PDF / Image / Audio / Video / Document / Spreadsheet / File) | `media_assets.mime_type` | Active media linked and church-scoped |
| File name | `media_assets.original_filename` | Same |
| Size | `media_assets.size_bytes` | Same (formatted B / KB / MB) |
| Icon | Derived from MIME | Same; info-only uses `article` |
| File / Info chip | Presence of usable `mediaAssetId` | Always on cards |

No category column on `blessboard.resources` — Stitch taxonomy (Sermon Notes, etc.) is **not** invented.

## 4. Filters / search

| Filter | Behavior |
|--------|----------|
| `all` | Full member-visible catalog |
| `files` | Items with usable media attachment |
| `info` | Items without downloadable file |
| `q` | Substring on title / description / file name (visible set only) |

## 5. Download handling (preserved)

| Route | Behavior |
|-------|----------|
| `GET /member/resources/:id/file` | Active member + published members-audience resource + private media load |
| Public `/_bb/media/:id` | Remains blocked for private assets |
| Detail CTA | Shown only when presentation keeps `mediaAssetId` (active, same-church media) |

Headers: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.

## 6. Unsupported Stitch elements omitted

- Fabricated category taxonomy (Sermon Notes / Study Series / …)
- Course progress / certificates / completion %
- “Active readers” or engagement metrics
- External-link resources (no URL column)
- Fabricated resource counts or featured series carousels

## 7. Empty states

| State | Marker |
|-------|--------|
| No published member resources | `data-bb-resources-empty="catalog"` |
| Filter/search yields nothing | `data-bb-resources-empty="no-results"` + clear link |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:forms-requests` | **10/10 pass** (visibility, filter/search, download auth, public-path block) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **38/38 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex token warnings only) |
| `git diff --check` | **clean** |

## 9. Suggested commit message

```
Polish member resources library with real file metadata and search.
```
