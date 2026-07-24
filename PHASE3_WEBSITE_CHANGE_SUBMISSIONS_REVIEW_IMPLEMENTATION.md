# PHASE3_WEBSITE_CHANGE_SUBMISSIONS_REVIEW_IMPLEMENTATION

## Stitch screens implemented

- **Phase3 - 01 - Website Change Submissions** (Desktop + Mobile) — project `17124191473876947591`
- **Phase3 - 02 - Website Change Review** (Desktop + Mobile)

## Routes added

| Method | Path |
|--------|------|
| GET | `/hq/website/change-submissions` |
| GET | `/hq/website/change-submissions/:submissionId` |
| POST | `/hq/website/change-submissions/:submissionId/approve` |
| POST | `/hq/website/change-submissions/:submissionId/request-changes` |
| POST | `/hq/website/change-submissions/:submissionId/reject` |

Reuses HQ auth (`church_hq_admin` / `platform_admin`), tenant context, CSRF, HQ shell, and existing `/hq/content` editor + preview URLs.

## Migration

`db/migrations/blessboard/040_create_website_change_submissions.sql`

- `blessboard.website_change_submissions`
- `blessboard.website_change_submission_events`
- Branch/organization scope trigger

## Files changed

- Migration `040_create_website_change_submissions.sql`
- `src/blessboard/repositories/websiteChangeSubmissionRepository.js`
- `src/blessboard/services/websiteChangeSubmissionService.js`
- `src/blessboard/http/websiteChangeSubmissionAdminRoutes.js`
- `views/blessboard/v5/hq/phase3-website-change-submissions.ejs`
- `views/blessboard/v5/hq/phase3-website-change-review.ejs`
- `public/blessboard/v5/hq-admin.css` (+ shell `?v=57`)
- `src/platform/http/v5FoundationServer.js` (mount)
- `views/blessboard/v5/hq/website.ejs` (link)
- `tests/phase3-website-change-submissions.test.js`

## Permission behavior

- HQ admin / platform admin only
- All queries scoped by `organization_id` from tenant context
- Cross-org ID lookup returns 404
- Branch admins and anonymous users denied

## Supported comparison fields

`heading`, `bodyText`, `mediaUrl`, `buttonText`, `buttonUrl`, `serviceTimes`, `contactDetails`, `sectionVisible`, `sortOrder`

Unknown JSON keys are not rendered. Unchanged / unavailable values are labeled.

## Status transitions

```
pending_review → approved | changes_requested | rejected
changes_requested → pending_review
approved → published
```

## Tests

- `tests/phase3-website-change-submissions.test.js` — **13/13 pass**
- Related: `blessboard-apex-hq-website-lifecycle`, `blessboard-church-website-publish`, `blessboard-hq-shell` — **26/26 pass**

## Deferred

- Branch submission creation UI
- Approve and publish now (no safe atomic apply + publish path)
- Proposed-content full preview
- Version restore/compare, audit browser, edit locking, notifications, approval settings, scheduled publishing

## Known blockers

None for the HQ list/review scope. Branch-side create/resubmit remains out of scope; HQ screens show empty state when no rows exist.
