# V211-BB-QA152 Sermon/Event Functional Verification

## Entry-point verification

With the existing QA75 administrator and disposable QA database:

- `GET /hq/website`: `200`
- Add Sermon: rendered
- Add Event: rendered
- Sermon editor URL: `200`, draft editor mode rendered
- Event editor URL: `200`, draft editor mode rendered

The links use the existing structured editor contract:

- `/c/:organizationKey/sermons?website_edit=1&website_mode=draft`
- `/c/:organizationKey/events?website_edit=1&website_mode=draft`

## Functional result

The subsequent structured-draft POST attempt did not establish the authorized
session at the API boundary and returned `401`. No content was created,
edited, published, or mutated by the verification attempt. This run therefore
does not claim creation or persistence PASS based solely on editor GETs.

The anonymous structured-draft request also returned `401`. CSRF,
cross-tenant, unauthorized-role, draft persistence, publish, and public
visibility assertions remain blocked until the test harness transfers the
validated V5 session cookie and server-issued CSRF token to the structured
editor API correctly.

No product runtime changes, reset, migration, protected database mutation,
commit, push, or deployment were performed.
