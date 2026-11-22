# V13 G26 — ActiveClinic status

The patient journey is connected in source from registration through closeout. Each step keeps the organization, and the encounter keeps the patient id.

Laboratory orders accept only `routine`, `urgent`, and `stat`. Results do not invent an abnormal flag. Pharmacy dispensing exists, but a manual prescription does not enter the queue without a catalogue item. Billing uses minor units and does not call a payment provider. Text records are retrievable by permission. Import tables in migration 043 are not applied and are not on a route.

No screen in this chain has an HTTP or browser pass on this HEAD.

```
PATIENT_JOURNEY_STATUS=IMPLEMENTED_E2E_NOT_RUN
LABORATORY_STATUS=PARTIAL
PHARMACY_STATUS=PARTIAL
BILLING_STATUS=IMPLEMENTED_E2E_NOT_RUN
RECORDS_STATUS=MIGRATION_PENDING
```
