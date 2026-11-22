# V13 G57 — laboratory reference ranges

`laboratoryReferenceRangeEngine.js` classifies a numeric result only when the caller supplies an approved rule for the same organisation, facility, test, and unit. No rule returns `unconfigured` and null flags. Another organisation returns `cross_tenant`. A different unit returns `incompatible_unit`. Two rules of the same version return `conflict`. The highest version wins. Critical is set only when that rule includes a critical bound that the value crosses. A stored interpretation is kept until `reassessAuthorized` is true.

`enterLaboratoryResult` uses the engine only when a component includes `approvedReferenceRule`. A cross-tenant, conflicting, or invalid rule rolls the result back as `INVALID_INPUT`. Components without a rule keep an explicit true or false abnormal flag and do not receive a default range.

`db/migrations/activeclinic/044_laboratory_reference_rules.sql` creates the storage table. It was not executed and no route inserts into it. Configuration persistence is `MIGRATION_PENDING`. `CLINICAL_THRESHOLDS=NOT_CONFIGURED`.

```
LAB_REFERENCE_RANGE_ENGINE=IMPLEMENTED_UNVERIFIED
LAB_REFERENCE_RANGE_CONFIGURATION=MIGRATION_PENDING
HTTP_TESTS=NOT_RUN
```
