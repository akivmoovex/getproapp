# Phase3 Batch C — Publication Confirmation, Approval Settings, Workflow Dashboard

## Screens

1. Phase3 - 12 - Publication Confirmation
2. Phase3 - 13 - Website Approval Settings
3. Phase3 - 14 - Website Workflow Dashboard

## Routes

| Method | Path | Notes |
|--------|------|--------|
| GET | `/hq/website/publish/review` | Confirmation UI |
| GET | `/hq/website/publish/result` | Success / failure result |
| POST | `/hq/website/publish` | Extended (note, notify prefs, mobile confirm) |
| GET/POST | `/hq/website/approval-settings` | HQ settings |
| GET | `/hq/website/workflow` | Workflow dashboard |

## Schema

- `db/migrations/blessboard/044_website_approval_settings.sql`

## Enforcement

- Prevent self-approval (service)
- Request-changes comment / rejection reason (settings-aware)
- Publish validation: readiness, preview (when settings persisted), mobile confirm, conflict drafts, pending submissions
- Trusted branch publish: stored only, not activated

## Tests

- `tests/phase3-publication-confirmation.test.js`
- `tests/phase3-website-approval-settings.test.js`
- `tests/phase3-website-workflow-dashboard.test.js`
