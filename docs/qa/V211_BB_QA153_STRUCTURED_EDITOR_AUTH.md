# V211-BB-QA153 Structured Editor Authentication

## Contract

The structured editor mutation endpoint is:

`POST /hq/content/api/structured-draft`

It requires JSON, the existing `blessboard_org_sid` session cookie, the
server-issued `blessboard_org_csrf` cookie, and the matching `_csrf` /
`X-CSRF-Token`. The payload includes `action`, `draftKind`, `pageKey`,
`entityKey`, `op`, and `payload`. Website editing authorization and church
scope are resolved from the signed-in session.

## Results

Using the QA142 QA75 administrator session and preserving both cookies:

- `GET /hq/members`: `200`
- Sermon structured editor GET: `200`
- Authorized structured draft save: `200`
- Anonymous structured draft save: `401`
- Invalid CSRF save: `403`
- Sermon create and edit: `200` / `200`
- Event create and edit: `200` / `200`
- Website publish: `303` to publish-success
- Public sermon page: `200`, edited synthetic sermon visible
- Public event page: `200`, edited synthetic event visible

Draft saves were performed before the publish request; publication was then
performed through the existing `/hq/website/publish` workflow. Raw session,
CSRF and synthetic credentials were not written to this report.

No product runtime changes, reset, migration, protected database mutation,
commit, push, or deployment was performed.
