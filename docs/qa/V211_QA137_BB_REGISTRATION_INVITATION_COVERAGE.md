# V211-QA137 BlessBoard Registration and Staff Invitation Coverage

## Test creation

Created and discovered four dedicated test files:

- `tests/bb-v211-qa137-member-registration.spec.cjs`
- `tests/bb-v211-qa137-member-registration.http.test.js`
- `tests/bb-v211-qa137-staff-invitation.spec.cjs`
- `tests/bb-v211-qa137-staff-invitation.http.test.js`

The Playwright configuration was updated only as test harness configuration
to include the QA137 browser specs and to default all database URLs to the
authorized disposable database. No product runtime code was changed.

## Execution

The four HTTP tests were discovered and skipped because the real-run flag and
approved runtime fixture were unavailable. The four browser tests were
discovered by Playwright but not executed. The existing browser prerequisite
remains blocked by the tenant application-profile redirect loop:
`GET /login` redirects indefinitely at the local browser harness.

The historical staff-invitation suite was not run because it calls
`resetFoundationDatabase()` and performs migrations. No reset, migration,
legacy `public.tenants` creation, protected database access, token capture or
production mutation occurred.

No functional PASS is claimed. Exact registration and staff invitation HTTP
statuses remain unverified pending a supported V2.11 runtime fixture.
