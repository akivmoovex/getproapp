# V2.13 D18 CI readiness

HEAD `b8f6b420d25e908de64ba292866c218c32edc30c` on `V13`. No database was opened. No workflow was dispatched. Disabled jobs remain `if: ${{ false }}`.

## What is actually implemented

Database-independent behavior tests from D16 and D17 execute real functions and, for sermons, the real router. Those do not close release blockers that need persistence or a browser.

The 11 files in `tests/v13/integration/` are scaffolds. Without the two write flags they record `NOT_RUN`. With both flags they call `assert.fail`. They do not create fixtures, call routes, or check rows. Authorizing Stage B today would fail those tests rather than produce evidence.

`tests/e2e/v13/v13-bb-qa-regression.spec.js` previously visited `/healthz` and treated a visible body as success. That false pass is removed. All 14 BlessBoard browser tests now name the real route and throw `NOT_IMPLEMENTED`. `tests/e2e/v13/v13-ac-platform-qa.spec.js` has five tests that throw `NOT_RUN`. `playwright.v13-bb-qa.config.cjs` does not select the ActiveClinic file. `playwright.v13-ac-platform.config.cjs` selects only that file and refuses to load without `E2E_DATABASE_URL`.

## Sermon handler

`tests/v13/unit/d18-sermon-route-http.test.js` mounts `registerBranchAdminSermonsRoutes` and passed. Evidence:

- `GET /branch/sermons/new` without a branch host returns 404.
- The same route with a branch host and no session returns 302 to `/branch/login`.
- A session for branch 2 against branch 1 returns 302 to `/branch/login`.
- `POST /branch/sermons` without a session returns 302 to `/branch/login`.

No matching session was sent. A matching session calls `getPgPool()` before title and date checks, so invalid-field and publish behavior still need the disposable database. That create path remains incomplete.

## CI isolation

`tests/v13/helpers/v13CiDatabaseGuard.js` allows only `127.0.0.1`, `localhost`, and `::1`, and only database names matching `getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}`. It rejects production host markers and shared names such as `postgres`, `getpro_ci`, and `shared_qa`. The guard tests passed.

Playwright maps `*.local.test` to `127.0.0.1`. The browser server binds `127.0.0.1`. Workflow permissions are `contents: read`. Triggers are `workflow_dispatch` only. There is no schedule, push, or pull request trigger.

`target_sha` is an optional 40-character pin on Stage A. Stage B and Stage C check out that pin when they are later enabled. Pinning was not executed.

Stage B creates one run-owned database, runs `scripts/ci/v13-assert-db-isolation.cjs`, bootstraps Foundation, and drops only that database. The job is still disabled. There is no secret-redaction step before the Playwright artifact upload. Traces are kept on failure and can contain cookies. The config also has a local default admin password. Both must be replaced or stripped before Stage C is allowed to run.

ActiveClinic and platform Stage B and Stage C jobs are still echo holds. They do not yet contain the database, migration, or Playwright steps. Those steps must be copied from the BlessBoard workflow only after the integration and browser bodies exist.

## Proposed sequence, not executed

1. Keep Stage A on the current nonmutating suites.
2. Finish the integration bodies so an authorized run performs the route and checks the row, and fails if the row is missing.
3. Finish the Playwright journeys so they submit the named forms.
4. Approve a disposable local database and a browser run as a separate change.
5. Only then remove `if: ${{ false }}` from Stage B and Stage C.
6. Leave OTP production activation blocked until the migration, provider, and release approvals exist.

## Checks run in D18

Readiness contract: 3 passed. Isolation guards: 6 passed. Sermon HTTP denial: 1 passed. Integration discovery: 11 records, all `NOT_RUN`. Failures: 0.
