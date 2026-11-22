# V13 G30 — records, migration, and retention

Text clinical documents, patient and facility indexes, consent capture, and consent withdrawal are already implemented. Final documents stay immutable.

Binary upload and scanned-file bytes stay deferred. `declareMigrationFile` still returns `binary_storage_deferred` when bytes are present. Migration `043_record_migration_inventory.sql` is the prepared batch, inventory, retention-category, and hold schema. It is not applied and is not mounted on a route.

Uncertain import matches stay `review_required` and are not merged. `requestPaperDisposal` still returns `legal_approval_required` with `deleted: false`. No retention age deletes a row. Juflona two-screen signing was not enabled.

```
MEDICAL_RECORDS=PARTIAL
RECORD_MIGRATION=MIGRATION_PENDING
```
