# V211-BB-QA151 Sermon/Event Fix

## Root cause

The canonical `/hq/website` management hub exposed the general website editor
but did not expose page-specific entry points for the existing V2.11 inline
editor. The existing sermon and event editors were already implemented in the
public website engine and are activated by the supported
`website_edit=1&website_mode=draft` navigation contract. No legacy
`/branch/*` route was reused.

## Fix

`views/blessboard/v5/hq/website-management.ejs` now renders authorized,
keyboard-accessible `Add Sermon` and `Add Event` links in the Website
Management quick-actions area. They target:

- `/c/qa75-91225-1792873862949/sermons?website_edit=1&website_mode=draft`
- `/c/qa75-91225-1792873862949/events?website_edit=1&website_mode=draft`

The links are rendered only when the existing `hubWebsite.canEdit` capability
and editor action are present. Existing editor authentication, CSRF, tenant
scope, draft/publish and persistence logic remains unchanged.

## Verification

With the authorized QA75 administrator and disposable QA database:

- `GET /hq/website`: `200`
- Add Sermon control: rendered
- Add Event control: rendered
- Sermon editor URL: `200`, Add Sermon control rendered
- Event editor URL: `200`, Add Event control rendered
- `git diff --check`: pass

Creation, persistence, publishing and unauthorized-role tests were not
executed in this focused UI fix run. No reset, migration, protected database
mutation, commit, push or deployment was performed.
