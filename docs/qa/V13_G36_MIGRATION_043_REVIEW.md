# V13 G36 — migration 043 review

File: `db/migrations/activeclinic/043_record_migration_inventory.sql`. It is in commit `ccb5859f`. It was not executed. Neither PostgreSQL instance was contacted.

## Schema

Owned by ActiveClinic. Depends on `platform.organizations`, `activeclinic.healthcare_organizations`, `activeclinic.facilities`, and `activeclinic.staff_members`, which already exist from earlier migrations. It does not alter patient or encounter tables. It follows `042`.

| Table | Purpose |
| --- | --- |
| `record_migration_batches` | Import batch, facility, source label, opener, status `open` |
| `record_migration_files` | Declared file metadata, origin, match status, optional patient |
| `retention_categories` | Caller-supplied category key, review status `pending_review` |
| `retention_holds` | Hold on a category, status `placed` |

Foreign keys use `ON DELETE RESTRICT`. `matched_patient_id` is nullable. Declared size must be greater than zero. There is no `DELETE`, `DROP`, or `TRUNCATE`. There is no down script. Recovery is a later forward migration.

Indexes cover facility and opened time, patient and capture date, and facility plus category.

## Who depends on it

`activeClinicRecordMigrationService.js` inserts into `record_migration_batches`. No HTTP route imports that service. Current gated tests do not need these tables. G05’s runner only refuses paper disposal and reads `SELECT 1`.

Any future import screen is `NOT_DEPLOYABLE` until 043 is applied on an authorized isolated database.

```
MIGRATION_043_REVIEW=REVIEWED_NOT_EXECUTED
MIGRATION_043_EXECUTED=NO
```
