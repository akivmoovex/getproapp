# AC-05 test audit

## D19 browser test

`tests/e2e/v13/v13-ac-platform-qa.spec.js` previously titled a receptionist billing request as AC-05. That request is `GET /app/billing` and `POST /app/billing/invoices`, and it accepted status 401 or 403. It does not sign in to `/admin`, does not call Test Database Management, and does not check `platform_administrator`.

A 401 from a missing session would not prove AC-05. That billing test was not executed. It remains a held billing denial under the label `BILLING-DENIAL`.

The D19 contract test that said this billing request proves AC-05 was corrected. It now checks that the billing journey and the held `/admin/settings/test-database` journey are both present, and it no longer calls the billing route the AC-05 contract.

## D19 integration runner

`d16-ac-auth.integration.test.js` calls `runGated` with the label `AC-05`. The gate returns `NOT_RUN` before opening a pool. The runner assigns clinic roles and appointments. It does not request `/admin/settings/test-database`. It was not executed in this stage.

## V2.02 middleware test

`tests/v2-02-platform-admin-rbac-convergence.test.js` already requests `GET /admin` with an injected assignment result. Denial is 403. The allowed response is only asserted not to be 403. It does not cover the test-database page, preview, CSRF, or the assignment-scope refusal. It was included in the G1 run because its pool is an in-memory double.

## What this stage added

`tests/v13/unit/d22-ac05-admin-denial.test.js` calls the real router and the real `hasActivePlatformAdministratorAssignment` against a SELECT-only double. The administrator page returns 200 and contains `Test Database Management`. The other active user receives 403 on the page and the preview. A missing session is a 303 to `/login`, not a 403. No write SQL was accepted. This is in-process evidence. It is not a live authenticated denial.

## Release consequence

AC-05 stays `NOT_RUN` for live evidence and `BLOCKED` as a release gate. The in-process 403 does not close `SEC-01-02`.
