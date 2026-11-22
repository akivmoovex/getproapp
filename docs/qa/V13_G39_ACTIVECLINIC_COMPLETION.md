# V13 G39 — ActiveClinic completion

No ActiveClinic service, route, or migration was changed. The supported journey is already wired:

`POST /app/patients` → `POST /app/clinical/start-encounter` → `/app/reception` → triage and vitals on the encounter → diagnosis → `order/:orderType` for laboratory and prescription → `/app/diagnostics/laboratory/queue` → `/app/pharmacy` → `/app/billing` → `closeEncounter` → `/app/clinical/patients/:patientId/documents`.

Laboratory orders, specimens, and results remain as implemented in G03. Reference ranges and critical thresholds were not invented. Result attachments stay deferred with the existing binary-storage rule.

Pharmacy still requires `activeclinic.pharmacy.dispense`. A quantity above the remaining amount is rejected. The prescription form still says manual entry only, so a catalogue picker was not added and no dose recommendation was invented.

Medical-record search stays on the existing document routes. `openMigrationBatch` is still not imported by any HTTP file. Migration 043 was not executed. Paper disposal still returns `legal_approval_required` with `deleted: false`.

Reporting that already exists, including `/app/billing/reports/revenue`, was not given new clinical metrics. Export, offline recovery, monitoring, accessibility, and performance stay blocked. Interoperability stays deferred.

A database-free contract in `tests/v13/contract/g39-g42-boundary-contracts.test.js` locks these boundaries. It does not change the G35 counts.

```
AC_IMPLEMENTED=16
AC_PARTIAL=7
AC_BLOCKED=6
AC_DEFERRED=1
MIGRATION_043_EXECUTED=NO
HTTP_TESTS=NOT_RUN
```
