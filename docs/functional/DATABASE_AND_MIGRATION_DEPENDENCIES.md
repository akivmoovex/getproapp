# Database and migration dependencies

G188 executed no migration. The shared OTP repository is source only. `platform.otp_challenges` was not created, and `db/migrations/platform/048_otp_challenges.sql` was not added. The reviewed script remains `docs/qa/V2132_G181_OTP_CHALLENGES.sql`.

G175 executed no migration. `platform.otp_challenges` is still absent, and `db/migrations/platform/048_otp_challenges.sql` was not added. Writes stayed on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`.

G165 executed no migration. `platform.otp_challenges` is still absent, and `db/migrations/platform/048_otp_challenges.sql` was not added. Writes stayed on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`.

G146 executed no migration. `platform.otp_challenges` is still absent, and `db/migrations/platform/048_otp_challenges.sql` was not added. Public `/healthz` `schemaCompatible=true` covers the V7 required checks only. It does not show migrations 043 or 044, and those two files remain applied only on `getpro_v13_e2e_g78d2301`. The hosted testing database was not contacted.

Migrations 043 and 044 remain applied only on `getpro_v13_e2e_g78d2301`. G120 applied no migration and did not add `db/migrations/platform/048_otp_challenges.sql`. `platform.otp_challenges` was not created. The reviewed table design is in `docs/qa/V13_G115_PLATFORM_OTP_MIGRATION_REVIEW.md`.

The shared PostgreSQL cluster on port 5432 is out of scope and was not contacted in G82. The older isolated QA database `getpro_v13_e2e_regression213101` on `127.0.0.1:55432` was not contacted. G78–G82 used only the disposable database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`, role `v13_regression_213101`.

Foundation bootstrap already ran once in D24 and once for the G78 disposable database. Do not run it again. Seeds `001`–`011` stay as they are. The safe migration-count contract expects 223 files: the historical set, `043_record_migration_inventory.sql`, and `044_laboratory_reference_rules.sql`.

Migrations 043 and 044 were applied only to `getpro_v13_e2e_g78d2301`. G82 HTTP and browser preflight confirmed `activeclinic.record_migration_batches` and `activeclinic.laboratory_reference_rules` on that database, with `public_booking_enabled` still 0. Hosted QA, production, port 5432, and `getpro_v13_e2e_regression213101` were not migrated. Deployment migration status is `NOT_EXECUTED`. The laboratory reference-rule page previews a rule and does not query `laboratory_reference_rules`.

## Migration 043

Status: committed in `ccb5859f`, reviewed in G36, applied only on `getpro_v13_e2e_g78d2301`. Not applied to hosted QA or production.

It creates `record_migration_batches`, `record_migration_files`, `retention_categories`, and `retention_holds`. Foreign keys use `ON DELETE RESTRICT`. It does not alter patients or encounters. It has no `DELETE FROM`, `DROP TABLE`, or `TRUNCATE`. There is no down script.

Current HTTP journeys do not need it. `openMigrationBatch` is still not imported by any file in `src/activeclinic/http`. It now refuses the insert unless the caller passes a granted `activeclinic.clinical_document.create` authorization. The import screen stays unrouted. Applying 043 on the disposable database does not make that screen operational, and it does not migrate any deployment database.

## What does not depend on 043

Patient registration, encounters, reception, triage, consultations, laboratory orders, manual prescriptions, dispensing, billing, text documents, BlessBoard membership, website drafts, sermons, events, and announcements.

## Fixture dependency

BlessBoard public-page rows are still absent. BB-06 and the homepage-section HTTP stay blocked on a later authorized fixture write. Do not insert them from this documentation pass.

## Runtime flags that stay unset

G82 set the HTTP and browser authorization flags only inside the gitignored runners for `getpro_v13_e2e_g78d2301`. The safe suite unset those flags and the database URLs. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` stays unset, which means uploads are off. Public booking stayed disabled. Production OTP stayed inactive.
