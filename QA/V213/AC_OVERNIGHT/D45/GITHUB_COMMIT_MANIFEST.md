# GitHub commit manifest

Nothing was staged, committed, or pushed. `git add -A` would mix 75 product files, 87 tests, 203 QA files, 4 held workflows, and 4 scripts. Do not use it.

## Product, 75 files

Includes the uncommitted OTP module (12 files), earlier BlessBoard and marketing files, `package.json`, and these D38–D42 ActiveClinic files:

- `src/activeclinic/http/activeClinicPatientPortalRoutes.js`
- `src/activeclinic/services/activeClinicPatientPortalRegistrationService.js`
- `src/activeclinic/services/activeClinicAppointmentService.js`
- `src/activeclinic/services/appointmentSchedulingRules.js`
- `src/activeclinic/services/activeClinicClinicalService.js`
- `src/activeclinic/services/clinicalScope.js`
- `src/activeclinic/services/activeClinicReceptionService.js`
- `src/activeclinic/repositories/receptionRepository.js`
- `src/activeclinic/services/activeClinicDiagnosticsService.js`
- `src/activeclinic/services/clinicalOperationsRules.js`
- `src/activeclinic/services/activeClinicPharmacyService.js`
- `src/activeclinic/services/activeClinicBillingService.js`
- `src/activeclinic/repositories/clinicalDocumentRepository.js`
- `src/activeclinic/services/activeClinicClinicalDocumentService.js`
- `src/activeclinic/services/documentScope.js`

## Tests, 87 files

`tests/v13/`, `tests/e2e/v13/`, and six BlessBoard or platform contract tests. A test-only commit cannot load, because the tests import the uncommitted OTP module and the D38–D42 services.

## QA, 203 files

Reports under `QA/V213/AC_OVERNIGHT/`. They do not by themselves make the suite pass on `origin/V13`.

## Proposed commit, not created

```
Record the V13 local ActiveClinic checks and the overnight QA reports.

Portal, appointment, clinical, billing, and document reads now stay inside the caller organization. Acceptance rows remain unpassed.
```

Push, also not run, would be `git push -u origin V13` after a reviewed commit. `ci.yml` does not trigger on `V13`. The four V13 workflows stay `workflow_dispatch` with jobs `if: ${{ false }}`. Pushing them does not start a database. QA commit readiness is no. GitHub push readiness is no.
