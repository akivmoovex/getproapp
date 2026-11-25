# V2.13.2 G191 disposable OTP execution plan

This plan was not executed. `docs/qa/V2132_G181_OTP_CHALLENGES.sql` was not changed and was not copied to `db/migrations/`. `048_otp_challenges.sql` was not created.

The script matches the queries in `src/platform/otp/otpPostgresStore.js`: non-null `organization_id`, the five statuses, `consumed`, `last_sent_at`, 64-character hashes, the attempt unique index, the pending lookup index, and `platform.otp_rate_buckets`. No correction was required.

Future target, only after a separate approval that names this file and this database:

- Host `127.0.0.1`
- Port `55432`
- Database `getpro_v13_e2e_g78d2301`

Order:

1. Record the approval against `docs/qa/V2132_G181_OTP_CHALLENGES.sql` and that database only.
2. Connect and read `current_database()`, `inet_server_port()`, and `platform.database_identity`. Stop unless the database is `getpro_v13_e2e_g78d2301` on port `55432` and the identity environment is `testing`.
3. Refuse port `5432` and `getpro_v13_e2e_regression213101`.
4. Read `to_regclass('platform.otp_challenges')` and `to_regclass('platform.otp_rate_buckets')`. Both must be null. Do not drop an existing table.
5. Confirm `platform.organizations` exists. Take a schema-only dump of the `platform` schema before the statements.
6. Run the reviewed script in one transaction. If it fails, the transaction rolls back. Do not continue.
7. Read the columns, checks, and indexes back. Compare them with the script.
8. Rollback, if required before any verified row exists, is `DROP TABLE platform.otp_rate_buckets, platform.otp_challenges`. If any row is `verified`, do not drop the table.
9. Run D14C and D16. They must use two pools, keep verification from opening a session, and read the stored hash and `consumed` flag. A missing table remains a failure.
10. Run the two-pool persistence test and then the authorized HTTP and browser regressions. Report every failure. Do not mark a schema block as a pass.

Applying the script does not set OTP activation to `ACTIVE`, does not send email, and does not deploy.
