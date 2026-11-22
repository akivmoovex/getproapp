# V13 G72 HTTP integration coverage

Database-writing HTTP tests were not run. Shared PostgreSQL was not contacted.

Existing gated runners remain `runG03Laboratory`, `runG04PharmacyBilling`, `runG05Records`, the BlessBoard runners, and the auth and OTP runners. Each integration file calls `runGated`. `runGated` returns `NOT_RUN` unless both database-write flags are set and `openAuthorizedPool` accepts the disposable database URL. The disposable name pattern, host `127.0.0.1`, and port `55432` stay in the existing guard. Port 5432 stays refused.

New file: `tests/v13/integration/g66-reference-rules.integration.test.js`. Its unauthorized path records `NOT_RUN` and skips. Its authorized path calls `previewReferenceRule`, asserts `persisted === false`, and queries `to_regclass` for `laboratory_reference_rules` and `record_migration_batches`. A missing table throws `MIGRATION_PENDING`. It does not insert a fixture.

The d19 contract now expects 19 integration files. This file was not executed.

Fixture requirement for a later authorized run: the existing disposable database, migrations through 044 applied by a separate authorization, and synthetic run-owned rows. This pass did not create that authorization.
