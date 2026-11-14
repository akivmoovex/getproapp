# G3 authenticated evidence plan

Not executed. Playwright was not launched. No disposable database was created.

Prepared request, behind `hold()` in `tests/e2e/v13/v13-ac-platform-qa.spec.js`:

1. Sign in on the local apex host with `E2E_AC05_LOWER_EMAIL` and `E2E_AC05_LOWER_PASSWORD`.
2. Confirm the browser is no longer on `/login`.
3. `GET /admin/settings/test-database` and require status 403.
4. Require the body not to contain `Test Database Management`.
5. `GET /admin/settings/test-database/preview?scope=selected_test_tenant` and require status 403, not 401.

The in-process administrator read is the positive control for a later run: the same page returns 200 only for an active `platform_administrator` on platform scope, and only when `DEPLOYMENT_ENV=testing` and the database identity is a testing key. That positive request must be a read. It must not call a reset or preview execution that deletes rows.

No-mutation check for the later run: count or reread the targeted rows before and after the 403, and fail if they change. The in-process double already refuses write SQL. A live run has to repeat that check against the disposable database.

Tenant check: do not satisfy the test by assigning `organisation_administrator` without a church key. That assignment returns `church_hq_admin_scope` and must keep returning it. The lower-privilege user has to be a real authenticated account with no `platform_administrator` row. Facility is not a parameter of this route.

Evidence to store after an approved run:

- `QA/V213/AC_OVERNIGHT/D22/evidence/` for status, final URL, and a redacted body excerpt
- no passwords, session cookies, CSRF tokens, or connection strings in that directory

Approvals required before execution:

1. A local disposable database whose name matches `getpro_v13_(ci|int|e2e)_` and whose host is `127.0.0.1`, `localhost`, or `::1`.
2. `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1` for fixture apply only.
3. `GETPRO_V13_BROWSER_AUTHORIZED=1` and `E2E_DATABASE_URL` pointing at that database.
4. `DEPLOYMENT_ENV=testing` and a testing database identity. A production identity must still make the page unavailable.
5. Persisted synthetic users for the administrator and the lower-privilege account, created only inside that database.
6. Confirmation that the browser target is `127.0.0.1`, which the server treats as an apex alias.

Until those approvals, `G3_EXECUTION_APPROVAL` stays required and the live denial stays `NOT_RUN`.
