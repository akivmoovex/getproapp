# V2.13.1 G03 — laboratory orders and results

The healthcare brief is still not on disk. This phase reused `activeClinicClinicalService` and `activeClinicDiagnosticsService`. No second patient identity was added, and no laboratory order is sent to an external service.

## What changed

The laboratory request form now posts a reason and a priority. The only accepted priorities are the stored values `routine`, `urgent`, and `stat`. An unknown word such as `high` is rejected before a query. An omitted priority stays `routine`, which is the column default. The selected priority and the reason are written onto `activeclinic.laboratory_requests` with the encounter, patient, and ordering clinician.

Result components still store a reference range only when the caller supplies one. A numeric result does not become abnormal or critical by itself. Critical acknowledgement remains the existing clinical-alert path. A separate non-critical review status was not added, because the stored result statuses are `draft`, `resulted`, `verified`, and `released`.

## Existing workflow left in place

| Area | Evidence |
| --- | --- |
| LAB_QUEUE | `loadActiveClinicDiagnosticsScreens.js` lists patient, test, urgency, and status. Routes require laboratory view permission and the laboratory department. |
| SPECIMENS | `collectSpecimen`, `receiveSpecimen`, and `rejectSpecimen` update only a request in the matching organization and facility. |
| RESULTS | `enterLaboratoryResult` stores the author, timestamp, order, and patient from the request. |
| CLINICIAN_ACKNOWLEDGEMENT | `acknowledgeCriticalResult` sets the matching active alert to `acknowledged` inside the same organization. |
| ROLE_ISOLATION | Result entry requires `activeclinic.lab.result`. The new browser check expects a receptionist to receive 401 or 403 on the laboratory queue. It was not executed. |

No migration was prepared. The tables are already in `db/migrations/activeclinic/017_diagnostics.sql`.

Database-free tests passed 453 and failed 0. The new HTTP file skips unless disposable database writes are authorized. Playwright was not run.

```
FINAL=V2131_G03
ORDERS=PRIORITY_STORED_HTTP_NOT_RUN
LAB_QUEUE=PRESENT
SPECIMENS=PRESENT
RESULTS=PRESENT_NO_INVENTED_RANGES
CLINICIAN_ACKNOWLEDGEMENT=CRITICAL_ALERT_ONLY
ROLE_ISOLATION=SOURCE_PRESENT_BROWSER_NOT_RUN
SAFE_TESTS_PASSED=453
SAFE_TESTS_FAILED=0
MIGRATIONS_PREPARED=0
BLOCKERS=Healthcare brief absent; HTTP and browser NOT_RUN; no approved reference-range catalogue; non-critical clinician review status is not in the stored result check; G04 prompt was not in this request
```
