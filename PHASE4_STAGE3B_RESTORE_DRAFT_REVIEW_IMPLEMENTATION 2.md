# Phase 4 Stage 3B — Restore Previous Website as Draft

## Stitch screens

| Stitch screen | View |
| --- | --- |
| Phase4 - Restore Previous Website | `phase4-restore-previous-website.ejs` |
| Phase4 - Restored Website Draft Review | `phase4-restored-website-draft-review.ejs` |

## Routes

| Route | Behavior |
| --- | --- |
| `GET /hq/website/recent-changes/:publicationId/restore` | Growth restore confirmation |
| `POST /hq/website/recent-changes/:publicationId/restore` | Create restored draft (CSRF) |
| `GET /hq/website/restored-draft` | Restored draft review |
| `POST /hq/website/restored-draft/discard` | Discard restored draft |
| Publish | Links to `GET /hq/website/publish/review` only |

## Eligibility

Growth plan · HQ admin · previous publication within five backups · not current live · usable snapshot · no conflicting unpublished draft (unless same restored draft → idempotent redirect).

## Theme handling

Default: keep current theme. Optional: use previous theme when it differs. Draft theme only until normal publish.

## Live-site safety

Restoration creates draft pages + draft restoration version record. Current published version row stays current. Historical snapshot immutable. No auto-publish.

## Draft conflict

Blocks with message to finish/preview current draft or return to overview. Discard reapplies current live snapshot as published pages and archives restoration draft.

## Migration

None.

## Tests

| Suite | Result |
| --- | --- |
| `phase4-restore-previous-website.test.js` | 20 pass / 0 fail |
| `phase4-recent-website-changes.test.js` | 16 pass / 0 fail |
| `phase4-publish-website.test.js` | 18 pass / 0 fail |
| `phase4-website-overviews.test.js` | 16 pass / 0 fail |
| `phase3-website-version-compare-restore.test.js` | 11 pass / 0 fail |
| **Regression batch** | **81 pass / 0 fail** |

## Security

HQ gate · Growth entitlement · org-scoped publication lookup · CSRF on POSTs · no current-live restore · five-backup cap · draft conflict · no direct publish · HTML escape of restoration notes.

## Manual verification

1. Growth HQ → Recent Website Changes → previous card → Restore as Draft.
2. Confirm live-unchanged notice; keep current theme; Create Restored Draft.
3. Restored Draft Review → Preview / Edit / Publish Draft → lands on Publish Website Review.
4. Confirm live site still shows current publication until publish.
5. Foundation HQ → restore URL returns 404.
6. With unpublished draft pages, restore shows draft conflict (no silent overwrite).

## Files changed

- `websitePublicationVersionService.js` (Growth restore/review/discard)
- `websitePublicationVersionAdminRoutes.js`
- `websiteOverviewService.js` + growth overview EJS (restored-draft notice; Restore links)
- Stage 3A recent-changes / previous-preview EJS (Restore as Draft)
- `websiteAuditService.js` (Growth restore action labels)
- New Phase4 restore/review EJS; `hq-admin.css` + shell `?v=66`
- Tests + this report

## Deferred

Network selective restore, page/section restore, compare UI, notifications.
