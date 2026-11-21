# V2.13.1 G14 — migration readiness

The only migration added in G01–G08 is `db/migrations/activeclinic/043_record_migration_inventory.sql`. It was not executed. Older migration files were not edited.

| Check | Result |
| --- | --- |
| Order | `043` follows `042_patient_visit_summary_releases.sql`. The safe suite now counts 222 migration files. |
| Identifiers | One new number, `043`. No second `043` file. |
| Existing patients | No `ALTER` of `activeclinic.patients` or encounter tables. |
| Tenant links | New tables reference `platform.organizations`, healthcare organizations, and facilities with `ON DELETE RESTRICT`. |
| Defaults and nulls | Batch status defaults to `open`. Match status defaults to `unmatched`. `matched_patient_id` is nullable. Declared file size must be a positive integer. |
| Rollback | There is no down script. Recovery is a later forward migration. Do not drop the tables while they contain an authorized import. |
| Seeds and fixtures | None. The tables stay empty until an authorized import. |
| Credentials | The file contains no connection string or secret. |
| Guards | The disposable-database guard and the 222-file count remain in the safe tests. |
| Gating | The service is not mounted on a route. Bytes are refused. Disposal stays `legal_approval_required`. |

Do not apply `043` on the shared cluster or the isolated regression database until a later prompt authorizes that write.

```
MIGRATIONS_PREPARED=1
MIGRATIONS_EXECUTED=NO
```
