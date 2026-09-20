# V8 Shared Website Section Management

**Status:** Active  
**Branch:** `V8`  
**Modules:** `src/platform/website/sections/`, `sectionRegistry.js`, `websiteAddSectionService.js`

## Goals

1. Common section lifecycle (add / update / remove / reorder) for BlessBoard and ActiveClinic.
2. Support **text**, **image**, and **image+text** core kinds (product types map onto these).
3. Product-specific types remain configuration in `sectionRegistry.js`.
4. Draft-only mutations; publish applies to live projection / published engine keys.
5. Stable section IDs and deterministic ordering.
6. Server-side `website.edit` on every mutation.

## Architecture

| Layer | Path |
|-------|------|
| Validation | `sections/sectionValidation.js` |
| Ordering / IDs | `sections/sectionOrdering.js` |
| Lifecycle facade | `sections/sectionManagementService.js` |
| Type catalogue | `sectionRegistry.js` |
| Add adapter | `websiteAddSectionService.js` |
| BB actions | `blessboardSectionActionService.js` |
| AC actions | `activeClinicSectionActionService.js` |

Storage is **not** unified: BB uses structured drafts → `page_sections`; AC uses `cms.sections` engine drafts. Snapshot shapes are preserved.

## Core kinds

| Kind | BlessBoard types | ActiveClinic types |
|------|------------------|--------------------|
| text | `plain_text` (+ CTA layout) | `text`, `cta` |
| image | `image` | (use `image_text` or media fields) |
| image_text | `image_text` | `image_text` |

## Permissions

- Mutations: **`website.edit`** only (`published: false`).
- Publish remains **`website.publish`** via existing publish services.
- Client org/church/branch/facility overrides rejected at routes.

## Migration

`db/migrations/blessboard/109_website_structured_draft_update_section_op.sql` — additive CHECK for `update_section`.

## Tests

- `tests/v8-shared-website-sections.test.js`
- Existing: `shared-website-section-lifecycle`, `shared-website-editor-wave4a`, `shared-website-editor-wave4b2`
