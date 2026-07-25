# Phase 4 Stage 2A — Publishing

## Stitch screens implemented

| Stitch screen | View |
| --- | --- |
| Phase4 - Publish Website Review | `phase4-publish-website-review.ejs` (responsive + mobile) |
| Phase4 - Publish Website Review - Mobile | same responsive view |
| Phase4 - Website Published | `phase4-website-published.ejs` |
| Phase4 - Publish Website Error | `phase4-publish-website-error.ejs` |

## Routes

| Route | Role |
| --- | --- |
| `GET /hq/website/publish/review` | Phase 4 review (replaces Phase 3 confirmation UI) |
| `POST /hq/website/publish` | Canonical publish entry (unchanged service path) |
| `GET /hq/website/publish/success` | Success screen |
| `GET /hq/website/publish/error` | Error screen (safe `codes=` query) |
| `GET /hq/website/publish/result` | Compatibility redirect → success/error |

## Services reused

- `publishChurchWebsite` (atomic TX; version record; submissions; audit)
- `validateWebsitePublication`
- `acknowledgeWebsitePreview`
- Publication version + change-submission repositories
- New presenter: `websitePublishReviewService.prepareWebsitePublishReview` (+ success/error helpers)

## Validation behavior

Friendly readiness states: Ready / Needs Attention / Confirmation Needed.  
Blocking: incomplete info, contact, conflicts, pending submissions, preview/mobile when required.  
Preview checkbox required on confirmation POST; stored preview ack reused when present.

## Atomic publication

Existing TX: re-validate → publish pages → settings → version/supersede → mark approved submissions published → audit.  
Failure leaves live site unchanged.  
Idempotent republish when already published with no drafts and no approved submissions waiting.

## Migration

None.

## Files changed

- `src/blessboard/services/websitePublishReviewService.js` (new)
- `src/blessboard/services/churchWebsitePublishService.js` (idempotency)
- `src/blessboard/http/churchWebsiteAdminRoutes.js`
- `views/blessboard/v5/hq/phase4-publish-website-review.ejs`
- `views/blessboard/v5/hq/phase4-website-published.ejs`
- `views/blessboard/v5/hq/phase4-publish-website-error.ejs`
- `public/blessboard/v5/hq-admin.css` + shell `?v=64`
- `tests/phase4-publish-website.test.js`
- `tests/phase3-publication-confirmation.test.js` (UI assertions)
- `tests/blessboard-apex-hq-website-lifecycle.test.js` (success redirect)

## Tests

- Focused: `tests/phase4-publish-website.test.js` — **18 pass / 0 fail**
- Regression: Phase 3 confirmation + Phase 4 Stage 1 overviews + Stage 2A — **43 pass / 0 fail**

## Security checks

HQ gate, CSRF on POST, org-scoped version lookup on success, safe error codes (no stack/SQL), escaped user content, no cross-org draft review.

Undo Last Publish, Previous Website Restored, restore preview/draft review, full Recent Website Changes page, scheduled publishing, notifications.

## Manual verification

1. HQ → `/hq/website/publish/review` → review checklist + Publish Website.
2. Publish with preview checked → success screen → View Live Website.
3. Block with pending submission or missing contact → error screen (“live website has not changed”).
4. Mobile width: sticky Publish bar, stacked cards.
5. Confirm no version/rollback jargon on review/success.
