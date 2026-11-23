# V13 G78 migrations 043 and 044

Both files were applied only in `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. They ran in filename order after `042_patient_visit_summary_releases.sql` as part of the 223-file migration pass. The existing regression database was not migrated.

| Version | File | Ledger | Objects |
| --- | --- | --- | --- |
| 043 | `043_record_migration_inventory.sql` | tracked | `record_migration_batches`, `record_migration_files`, `retention_categories`, `retention_holds` |
| 044 | `044_laboratory_reference_rules.sql` | tracked | `laboratory_reference_rules` |

Confirmed constraints include `record_migration_batches_status_check`, `record_migration_files_origin_check`, `laboratory_reference_rules_bounds`, `laboratory_reference_rules_status`, and `laboratory_reference_rules_hco_org_fk`. The foreign keys still bind healthcare organisation and organisation together. Both new tables are empty. No clinical reference range was inserted.

Repeat application skipped both files and reported no checksum drift. ActiveClinic ledger rows are 44, which is the previous 42 plus these two files.

`verifyFoundation` does not yet list these five tables, so it reports `unexpected_product_table` for them and no other product table. That is an allowlist gap, not a missing migration. No destructive statement was added, and patients and encounters were not altered by these two files.
