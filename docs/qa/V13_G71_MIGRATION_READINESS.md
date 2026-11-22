# V13 G71 migration readiness

Migrations 043 and 044 were reviewed and not applied. No database connection was opened.

`043_record_migration_inventory.sql` follows 042. It creates batch, file, retention-category, and retention-hold tables. Foreign keys use `ON DELETE RESTRICT`. It does not alter patients or encounters and has no `DELETE FROM`, `DROP TABLE`, or `TRUNCATE`.

`044_laboratory_reference_rules.sql` follows 043. It creates `laboratory_reference_rules` with organisation, facility, and staff foreign keys, range and version checks, and an index on organisation, facility, test, unit, and effective date. Its comment states that a missing row is not a normal or critical result. No service inserts into that table. The new preview route does not query it.

The migration-count contract remains 223. No new migration file was added. The authorized G66 runner refuses to pass while either new table is absent.

Status: `MIGRATION_043=NOT_EXECUTED`. `MIGRATION_044=NOT_EXECUTED`.
