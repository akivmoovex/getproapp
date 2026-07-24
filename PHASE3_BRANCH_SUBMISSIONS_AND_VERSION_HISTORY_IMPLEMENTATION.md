# PHASE3_BRANCH_SUBMISSIONS_AND_VERSION_HISTORY_IMPLEMENTATION

## Stitch screens implemented

- **Phase3 - 03 - My Website Submissions** (Desktop + Mobile)
- **Phase3 - 04 - Submit Website Changes** (Desktop + Mobile)
- **Phase3 - 05 - Website Version History** (Desktop + Mobile)

## Existing Phase 3 architecture reused

- Tables from migration `040`
- `websiteChangeSubmissionRepository.js` / `websiteChangeSubmissionService.js`
- HQ routes/views for screens 01–02
- HQ shell, Branch Admin shell, CSRF, org scoping

## Routes added

| Method | Path |
|--------|------|
| GET | `/branch-admin/website/submissions` |
| GET | `/branch-admin/website/submissions/:submissionId` |
| GET | `/branch-admin/website/submit` |
| POST | `/branch-admin/website/submissions/draft` |
| POST | `/branch-admin/website/submissions/submit` |
| POST | `/branch-admin/website/submissions/:id/save` |
| POST | `/branch-admin/website/submissions/:id/submit` |
| POST | `/branch-admin/website/submissions/:id/withdraw` |
| POST | `/branch-admin/website/submissions/:id/duplicate` |
| GET | `/hq/website/version-history` |

Canonical Branch Admin prefix is `/branch-admin` (not `/branch`).

## Files changed

- `db/migrations/blessboard/041_website_draft_and_publication_versions.sql`
- Extended submission repository + service
- `websitePublicationVersionRepository.js` / `websitePublicationVersionService.js`
- `websiteChangeSubmissionBranchRoutes.js`
- `websitePublicationVersionAdminRoutes.js`
- Phase3 EJS views (branch list/detail/submit + HQ version history)
- Publish service records versions in the same TX
- CSS bumps (branch-admin `?v=39`, hq-admin `?v=58`)
- Tests + this report

## Migration

`041` adds:

- `draft` status + nullable `submitted_at`
- `priority`, `requested_publication_date`, `checklist_json`
- `withdrawn` event type
- `website_publication_versions` (+ one published version per org)

## Submission workflow

Branch: draft → save → submit (`pending_review`) → HQ review (existing 01/02)  
Resubmit: `changes_requested` → `pending_review`  
Withdraw: `draft` | `pending_review` | `changes_requested` → `withdrawn`

## Version history

Created inside `publishChurchWebsite` transaction. Snapshot = public page keys/sections only (no private management data). Prior live version → `superseded`.

## Tests

- `phase3-branch-website-submissions.test.js` — pass
- `phase3-website-version-history.test.js` — pass
- `phase3-website-change-submissions.test.js` — pass
- Related HQ website/shell regressions — run with this batch

## Deferred

Version compare/restore, approve-and-publish-now, notifications, scheduling, locking, audit browser, conversation UI.

## Manual verification

1. Apply migrations through `041`
2. Branch admin: `/branch-admin/website/submit` → Save Draft → Submit → list/detail
3. HQ: approve via `/hq/website/change-submissions`
4. HQ: publish from `/hq/website` → `/hq/website/version-history` shows current + superseded
