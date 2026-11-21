# V2.13.1 G10 — clinical integrity

No diagnostic threshold, dose rule, or treatment policy was added.

| Check | Result |
| --- | --- |
| Identity matching | A blocking duplicate returns `duplicate_warning`. `mergeActiveClinicPatients` stays `merge_deferred`. Two strong migration matches stay `review_required`. |
| Observations | Unknown vital types are rejected before a query. A later vital may point at `corrects_observation_id`. No abnormal flag is calculated from a number. |
| Encounter ownership | Start and close both require the patient and encounter to match the organization and facility. |
| Handoff | The queue shows Start triage only for `activeclinic.triage.record`. Consultation is a separate permission. |
| Diagnosis and prescription | Diagnosis text is stored on the encounter. A prescription order stores the entered dose, route, frequency, and duration. It does not choose them. |
| Laboratory | A result is inserted only for the request’s own patient. `is_critical` is stored only when the caller sets it. |
| Amendments | Signed consultation notes cannot be edited. The service still does not insert `consultation_note_amendments`, which the existing contract forbids. |
| Closure | `closeEncounter` updates one open row and increments `version`. A missing scope returns `invalid_input` without a query. |
| Audit | Clinical writes call `recordAuditEventSafe`. Metadata redaction still drops passwords and OTP values. |

Negative coverage added in `tests/v13/unit/g09-g12-hardening.test.js` and `tests/v13/contract/g09-g15-hardening-contract.test.js`.

```
CLINICAL_SAFETY_GAPS=HTTP not run; non-critical result review is deferred; signed-note amendments stay unsupported by the existing contract; critical flags are caller-supplied
```
