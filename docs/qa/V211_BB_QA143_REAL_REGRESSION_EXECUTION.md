# V211-BB-QA143 Real Regression Execution

## Placeholder replacement

The four QA137 HTTP tests no longer contain `assert.fail()` placeholders.
They now instantiate the supported V5 foundation app, use the existing QA75
administrator with `createV5Session`, send real tenant-hosted Supertest
requests, and assert route responses.

## Execution

HTTP results:

- member registration form: PASS, `GET /register` returned `200`
- member registration invalid CSRF: FAIL, `POST /register` returned `200`
  instead of the expected controlled `400/403`; no valid registration data
  was submitted
- authorized staff invitation form: PASS, `GET
  /hq/settings/staff-access/invite` returned `200`
- anonymous staff invitation: FAIL in the test expectation because the
  application returned `303` to the login flow, which is a controlled denial
  but was not included in the assertion

No invitation was created, no raw token was logged, and no browser activation
flow was completed. The browser QA137 run was not repeated after these HTTP
changes. The authenticated HQ smoke remains proven separately at `200`.

The `200` invalid-CSRF behavior is a confirmed route/security behavior
requiring follow-up; no product source was changed in QA143.
