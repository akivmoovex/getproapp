# V211-BB-QA140 Registration and Staff Invitation Runtime

## Environment

The test process used `blessboard-org-staging`, `NODE_ENV=test`,
`DEPLOYMENT_ENV=testing`, `BASE_DOMAIN=blessboard.org`, the QA105
authoritative host, and the disposable database. The Playwright harness was
corrected so its web-server environment no longer hard-codes `local.test`.

## QA137 execution

All four existing QA137 browser tests executed:

- Member registration valid flow: failed because the browser URL remained
  `http://127.0.0.1:4175/register`, while the test incorrectly expected the
  tenant hostname in the browser URL.
- Member registration invalid CSRF: failed after the hidden CSRF input was
  selected with `fill()`, which Playwright correctly rejects because hidden
  inputs are not editable.
- Staff invitation setup: failed because the login URL expectation did not
  match the local origin/redirect behavior.
- Invalid staff invitation: passed; controlled denial rendered.

No QA137 HTTP test was executed because the existing HTTP files are
prerequisite-gated and the supported real-run fixture was not available.
Therefore registration persistence, valid CSRF lifecycle, staff setup,
activation, login and role-dashboard results remain unverified.

No product source, migration, database reset, protected database mutation,
commit, push or deployment was performed.
