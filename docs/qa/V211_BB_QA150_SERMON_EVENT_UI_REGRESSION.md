# V211-BB-QA150 Sermon/Event UI Regression

## Runtime

- Branch: `qa-v211-overnight-20261017`
- HEAD: `3df272ba6388b2a2360cd77b665aeba8ee8cacd3`
- Database: `getpro_v211_qa_disposable_03`
- Identity: `moovex-platform-v7/testing`
- Authorized user: existing QA75 HQ administrator

## Navigation and rendering

The canonical Website Management route is `GET /hq/website`; it returned
`200` for the authorized QA75 administrator and rendered the `Website · QA75
Church` page. The authenticated response contained no visible or enabled
“Add Sermon” or “Add Event” control and no sermon/event creation link.

The canonical public content routes are `GET /sermons` and `GET /events`;
both returned `200`, but neither rendered an authenticated editing control or
creation URL. The attempted guessed paths
`/hq/website/branches/campus-east/pages/sermons` and
`/hq/website/branches/campus-east/pages/events` returned `404` and were not
treated as canonical routes.

## Classification

- BB-06 / Add Sermon: `CONTROL_MISSING`
- BB-07 / Add Event: `CONTROL_MISSING`

Because no supported creation URL was rendered, creation, persistence,
editing, publishing, denied-role and cross-tenant mutation tests were not
executed. This is a UI/navigation reproduction, not evidence of a persistence
failure. No product source, migration, reset, protected database mutation,
commit, push, or deployment was performed.
