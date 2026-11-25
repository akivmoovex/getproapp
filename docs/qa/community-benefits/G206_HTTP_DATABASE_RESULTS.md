# G206 HTTP and database results

The community HTTP test is `tests/v13/unit/g198-community-http.test.js`. It is not in `.v13-isolated-pg/g79-run.cjs`, so the existing 36-test HTTP suite is unchanged. Its result is recorded with the regression runs in the final handoff.

`tests/v13/integration/g206-community-benefits.integration.test.js` calls `runGated`. Without database-write authorization the result is `NOT_RUN`. That pass is not persistence proof. The same file was opened once against `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. It threw `BLOCKED_BY_MIGRATION: activeclinic.community_memberships is not present. Refusing to create it.` The exit was 1. No table was created. That failure is the schema gate. It is not part of the 36-test HTTP suite.

No community table was created. No shared database was used. `COMMUNITY_HTTP_POSTGRES_PASS` is 0.
