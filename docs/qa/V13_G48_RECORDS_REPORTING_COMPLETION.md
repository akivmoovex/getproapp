# V13 G48 — records, reporting, and operations

Document list, search, patient scope, and encounter scope already exist. Binary download stays deferred. No patient file was imported or deleted.

`openMigrationBatch` now returns `access_denied` and does not query unless `authorization.ok` is true and the permission key is `activeclinic.clinical_document.create`. No HTTP file imports it. Migration 043 was not executed. The import feature stays `MIGRATION_PENDING` and `BLOCKED`.

No new registration, queue, laboratory, pharmacy, or audit report was added. Existing billing revenue reports were not executed. `runDataJobExport` was not called. A new aggregate would have been an invented metric.

`/app/offline` still returns 503 and does not write. No restore ran. Accessibility, pagination, and monitoring were not newly audited.

```
MEDICAL_RECORDS=PARTIAL
RECORD_MIGRATION=MIGRATION_PENDING
REPORTING=NOT_DEMONSTRATED
EXPORTS=NOT_EXECUTED
MIGRATION_043_EXECUTED=NO
```
