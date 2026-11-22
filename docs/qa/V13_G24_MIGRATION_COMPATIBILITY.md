# V13 G24 — migration compatibility

G01–G23 added one migration: `db/migrations/activeclinic/043_record_migration_inventory.sql`. It is in commit `ccb5859f`. It was not executed. Older migration files were not edited.

| Check | Result |
| --- | --- |
| Identity | One file numbered `043`, after `042` |
| Destructive SQL | No `DELETE`, `DROP`, or `TRUNCATE` |
| Existing patients | No change to `activeclinic.patients` or encounters |
| Foreign keys | Organization, healthcare organization, and facility links use `ON DELETE RESTRICT` |
| Nullability | `matched_patient_id` is nullable. Declared file size must be positive |
| Defaults | Batch status `open`. Match status `unmatched`. Hold status `placed` |
| Indexes | Facility, patient/date, and category indexes are in the file |
| Rollback | No down script. Recovery is a later forward migration |
| Feature gate | No route calls the new tables. Bytes are refused in the service |
| Credentials | None |
| Isolated database | Not contacted and not reset |

Future execution, only when a later prompt authorizes it: apply `043` on the isolated instance after the disposable-database guard passes. Do not apply it on port `5432`.

```
MIGRATIONS_PREPARED=1
MIGRATIONS_EXECUTED=NO
```
