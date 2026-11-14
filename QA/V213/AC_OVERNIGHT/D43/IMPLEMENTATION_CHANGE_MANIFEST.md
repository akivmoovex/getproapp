# Implementation change manifest

`V13` HEAD is still `b8f6b420d25e908de64ba292866c218c32edc30c`. The index is empty. Migrations and `ci.yml` are not dirty. These are the D38–D42 source and test files, not the earlier dirty product tree.

## Product files, 15

| Stage | Files |
|---|---|
| D38 | `activeClinicPatientPortalRegistrationService.js`, `activeClinicPatientPortalRoutes.js` |
| D39 | `activeClinicAppointmentService.js`, `appointmentSchedulingRules.js` |
| D40 | `activeClinicClinicalService.js`, `clinicalScope.js`, `activeClinicReceptionService.js`, `receptionRepository.js` |
| D41 | `activeClinicDiagnosticsService.js`, `clinicalOperationsRules.js`, `activeClinicPharmacyService.js`, `activeClinicBillingService.js` |
| D42 | `clinicalDocumentRepository.js`, `activeClinicClinicalDocumentService.js`, `documentScope.js` |

## Test files, 12

D38 through D42 added ten unit or contract files. D39 also added a gated case to `tests/v13/integration/d25-appointment-concurrency.integration.test.js`. D41 updated the D33 acknowledgement contract so it matches the patient-scoped alert. That integration file is not part of the G1 command.

`node --check` passed on all 15 product files. The repository has no lint script. No BlessBoard source file is in this list.
