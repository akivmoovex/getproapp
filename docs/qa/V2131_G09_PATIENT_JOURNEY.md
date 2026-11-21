# V2.13.1 G09 — patient journey verification

G08 classified every journey row as partial. This pass traced the source. No transition was executed over HTTP or in a browser.

| Step | Entry | Service | Ownership | Status rule | Gap |
| --- | --- | --- | --- | --- | --- |
| Registration | `POST /app/patients` | `registerActiveClinicPatient` | Organization and facility on the insert | Duplicate warning blocks insert unless an authorized override is sent | HTTP not run |
| Visit | `POST /app/clinical/start-encounter` | `startEncounter` | Patient must belong to the organization; encounter stores that patient id | A second open encounter for the same patient and facility returns `duplicate_active_encounter` | HTTP not run |
| Reception | Walk-in and check-in routes | `checkInWalkInPatient`, `createQueueEntry` | Facility service point must belong to the selected facility | A second active queue row returns `duplicate_active_queue_entry` | HTTP not run |
| Triage | `GET /app/clinical` then start with `intent=triage` | `recordTriageAssessment`, `recordVitalSignObservation` | Vitals use the encounter’s patient id | Requires `activeclinic.triage.record` | HTTP not run |
| Consultation | Encounter workspace | `recordConsultationNote` | Note patient must match the encounter | A signed note returns `cannot_edit_signed` | HTTP not run |
| Laboratory | `POST .../order/lab` | `createClinicalOrder` then diagnostics services | Request copies encounter, patient, and facility | Stored priority only: `routine`, `urgent`, `stat` | HTTP not run |
| Pharmacy | `POST .../order/prescription` | `createClinicalOrder` | Catalogue item must be in the same organization | Manual text stays off the queue without a catalogue id and a whole-number quantity | HTTP not run |
| Billing | `/app/billing` | `activeClinicBillingService` | Tenant and facility on the invoice | Amounts are minor units. `duplicate_submission` exists | HTTP not run |
| Closeout | Encounter close | `closeEncounter` | Update requires organization, facility, open status, and version | A missing actor never reaches the database | HTTP not run |
| Retrieval | `/app/clinical/patients/:patientId/documents` | `activeClinicClinicalDocumentService` | Document list is organization and facility scoped | File bytes are still deferred | HTTP not run |

Downstream access is by permission and department: clinical view, laboratory view, pharmacy view, and billing view are separate. A receptionist is not granted triage.

Nothing in this trace is `VERIFIED`.

```
PATIENT_JOURNEY_IMPLEMENTED=PARTIAL
PATIENT_JOURNEY_GAPS=HTTP and browser NOT_RUN; pharmacy queue needs a catalogue item; clinical file bytes deferred; migration 043 not applied
```
