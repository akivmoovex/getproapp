# Database and migration dependencies

The shared PostgreSQL cluster on port 5432 is out of scope. The isolated instance, when a later phase is authorized, is `127.0.0.1:55432`, database `getpro_v13_e2e_regression213101`, role `v13_regression_213101`. This phase did not connect to either.

Foundation bootstrap already ran once in D24. Do not run it again. Seeds `001`–`011` stay as they are. The safe migration-count contract expects 222 files: the historical set plus `db/migrations/activeclinic/043_record_migration_inventory.sql`.

## Migration 043

Status: committed in `ccb5859f`, reviewed in G36, not executed.

It creates `record_migration_batches`, `record_migration_files`, `retention_categories`, and `retention_holds`. Foreign keys use `ON DELETE RESTRICT`. It does not alter patients or encounters. It has no `DELETE FROM`, `DROP TABLE`, or `TRUNCATE`. There is no down script.

Current HTTP journeys do not need it. `openMigrationBatch` is not imported by any file in `src/activeclinic/http`. A future import screen is not deployable until 043 is applied and a permission check exists.

## What does not depend on 043

Patient registration, encounters, reception, triage, consultations, laboratory orders, manual prescriptions, dispensing, billing, text documents, BlessBoard membership, website drafts, sermons, events, and announcements.

## Fixture dependency

BlessBoard public-page rows are still absent. BB-06 and the homepage-section HTTP stay blocked on a later authorized fixture write. Do not insert them from this documentation pass.

## Runtime flags that stay unset

`GETPRO_V13_ALLOW_DB_WRITES`, `GETPRO_V13_DB_STAGES_AUTHORIZED`, `GETPRO_V13_BROWSER_AUTHORIZED`, and `GETPRO_V13_HTTP_AUTHORIZED` were not set. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` stays unset, which means uploads are off.
