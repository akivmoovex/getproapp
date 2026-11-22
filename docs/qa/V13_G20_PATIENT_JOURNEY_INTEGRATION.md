# V13 G20 — patient journey integration

The supported journey is already one chain in source. This phase did not add a second patient, encounter, or billing model. No database or browser run was performed.

| Step | Connection | Status |
| --- | --- | --- |
| Registration | `registerActiveClinicPatient` keeps the organization and blocks an unresolved duplicate | IMPLEMENTED, E2E not run |
| Visit | `startEncounter` stores that patient and facility. A second open encounter at the same facility returns `duplicate_active_encounter` | IMPLEMENTED, E2E not run |
| Reception | Check-in uses a service point in the selected facility. A second active queue row is rejected | IMPLEMENTED, E2E not run |
| Triage | Start triage requires `activeclinic.triage.record`. Vitals store type, unit, time, and staff id on the encounter’s patient | IMPLEMENTED, E2E not run |
| Consultation | The note is tied to the encounter. A signed note cannot be overwritten | IMPLEMENTED, E2E not run |
| Laboratory | The lab form posts priority and reason. The request copies encounter, patient, and facility. Unknown priorities are rejected. Reference ranges are not invented | PARTIAL for ranges, otherwise E2E not run |
| Pharmacy | Dose, frequency, and duration are required. The queue row is created only with a catalogue item in the same organization and a whole-number quantity | PARTIAL |
| Billing | Invoices use integer minor units and `duplicate_submission`. No payment provider is called | IMPLEMENTED, E2E not run |
| Closeout | `closeEncounter` updates one open row for that organization and facility and increments version | IMPLEMENTED, E2E not run |
| Records | Text documents are listed by patient and facility. File bytes and migration 043 are not available on a route | PARTIAL |

No new migration was added. Existing gated HTTP and Playwright files were left fail-closed and were not run.
