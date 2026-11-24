# V13 G102 browser fixture recovery

`tests/e2e/v13/v13-bb-public-fixture.cjs` publishes `v13d19-church-a` and `v13d19-church-b` only when the connection string is `127.0.0.1:55432` and `getpro_v13_e2e_g78d2301`. It refuses port 5432 and `getpro_v13_e2e_regression213101`. It checks `current_database()`, `inet_server_port()`, and `platform.database_identity` before writing.

The fixture inserts a missing settings row with the public name and primary email. It does not set `website_status`. It calls `provisionEmptyPublicPages` and `publishChurchWebsite` with `confirmPublish` and `deferServiceTimes`. Churches that are already published are left unchanged.

Playwright setup calls that fixture only for the disposable database. Other authorized environments still skip the legacy schema and do not open a pool. The database-free contract that forbids a connection on the skip path passes.

Public browser paths are `/c/v13d19-church-a` and `/c/v13d19-church-b`. CSRF for the member form is matched by token value. Church registration checks the consent box with `force` because the native checkbox is not visible, then submits the review form.
