# V211-QA141 Fixture and Browser Correction

## Harness corrections

The QA137 browser assumptions were corrected in the dedicated test files:

- local browser URLs are asserted against the local `baseURL`; tenant routing
  is carried by the configured forwarded host and server environment
- the positive registration test no longer edits a hidden CSRF input
- the staff login check no longer assumes a particular redirect URL
- the Playwright config uses `BASE_DOMAIN=blessboard.org` instead of the
  incompatible `local.test` default

No product runtime code was changed.

## Execution

With the QA105 environment and authorized disposable database:

- member registration browser form/CSRF render: PASS
- member registration browser CSRF preservation: PASS
- invalid invitation controlled denial: PASS
- staff invitation entry: FAIL; no authorized staff session/fixture was
  established, so `/hq/staff` did not expose the Invite Staff control

The two HTTP tests remain prerequisite-gated and skipped. No supported
non-destructive fixture creation was invoked because the available historical
staff suite calls `resetFoundationDatabase()` and migrations.

No valid registration persistence, staff invitation issuance, setup,
activation, login or role-dashboard result is claimed. No database reset,
migration, protected database access, commit, push or deployment occurred.
