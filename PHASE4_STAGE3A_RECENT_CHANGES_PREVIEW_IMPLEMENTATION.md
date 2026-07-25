# Phase 4 Stage 3A — Recent Website Changes + Previous Preview

## Stitch screens implemented

| Stitch screen | View |
| --- | --- |
| Phase4 - Recent Website Changes | `phase4-recent-website-changes.ejs` |
| Phase4 - Recent Website Changes - Mobile | same responsive view |
| Phase4 - Previous Website Preview | `phase4-previous-website-preview.ejs` |

## Routes

| Route | Behavior |
| --- | --- |
| `GET /hq/website/recent-changes` | Growth-only recent changes list |
| `GET /hq/website/recent-changes/:publicationId/preview` | Growth-only previous website preview |
| Existing `/hq/website/version-history/*` | Unchanged (Phase 3 / Network) |

## Retention

Current published website + up to **five** previous publications (newest first). List queries omit full `snapshot_json`.

## Historical preview

Reuses immutable publication snapshots via `loadHistoricalPublicationPreview` / `loadGrowthPreviousWebsitePreview`. Read-only HQ shell frame with desktop/mobile viewport toggle, sticky banner, `noindex` / `X-Robots-Tag`. Current publication redirects away. Does not mutate draft or live pages. Restore omitted (Stage 3B).

## Plan gating

Server-side Growth entitlement via `evaluatePublishReadiness` → `planKey`. Foundation receives 404.

## Existing methods reused / extended

Repository: `listRecentWebsitePublications`, `loadCurrentWebsitePublication`, `loadPreviousWebsitePublication`, `loadHistoricalPublicationPreview`  
Service: `loadGrowthRecentWebsiteChanges`, `loadGrowthPreviousWebsitePreview`  
Growth overview + Stage 2A success link → `/hq/website/recent-changes`

## Migration

None.

## Files changed

- `websitePublicationVersionRepository.js`
- `websitePublicationVersionService.js`
- `websitePublicationVersionAdminRoutes.js`
- `websiteOverviewService.js` / growth overview EJS
- `websitePublishReviewService.js` (success recent-changes path)
- `phase4-recent-website-changes.ejs`, `phase4-previous-website-preview.ejs`
- `hq-admin.css` + shell `?v=65`
- `tests/phase4-recent-website-changes.test.js`
- `PHASE4_STAGE3A_RECENT_CHANGES_PREVIEW_IMPLEMENTATION.md`

## Tests

- Focused: `tests/phase4-recent-website-changes.test.js` — **16 pass / 0 fail**
- Regression (Stage 3A + Stage 2A publish + Stage 1 overviews + Phase 3 publishing history + compare/restore): **66 pass / 0 fail**

## Deferred (Stage 3B) (Stage 3B)

Restore as Draft, restored-draft review, page/section restore, compare UI.

## Manual verification

1. Assign Growth plan → `/hq/website/recent-changes` shows Current + previous cards.
2. Foundation org → 404 on the same route.
3. Preview a previous publication → banner, snapshot content, no edit controls.
4. Current publication preview redirects; live/draft unchanged after preview.
5. Growth overview “View all” / Preview links use `/hq/website/recent-changes*`.
