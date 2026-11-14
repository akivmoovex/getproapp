# GitHub commit manifest

Nothing was staged, committed, or pushed. `git add -A` would mix 80 product files, 100 tests, the QA tree, 4 held workflows, and 4 scripts. Do not use it.

## D46–D53 product files, 11

These are the ActiveClinic files edited after D45. BlessBoard was not in this set.

- `src/activeclinic/services/activeClinicPatientPortalProfileService.js`
- `src/activeclinic/services/activeClinicBillingService.js`
- `src/activeclinic/services/activeClinicPatientPortalPasswordService.js`
- `src/activeclinic/http/activeClinicPatientPortalRoutes.js`
- `src/activeclinic/services/activeClinicPublicBookingService.js`
- `src/activeclinic/services/clinicalScope.js`
- `src/activeclinic/services/activeClinicClinicalService.js`
- `src/activeclinic/services/activeClinicDiagnosticsService.js`
- `src/activeclinic/services/activeClinicPharmacyService.js`
- `src/activeclinic/services/activeClinicPatientPortalClinicalReadService.js`
- `src/activeclinic/services/activeClinicPatientConsentService.js`

The other dirty product files, including BlessBoard and the OTP module, are earlier work. BlessBoard source still has no `activeclinic.patients` query. D46–D53 did not change that behavior.

## Tests, 100 files

They import the uncommitted OTP module and the services above. A test-only commit cannot load on `origin/V13`.

## Proposed commit, not created

```
Record the V13 organization checks for portal, booking, clinical, and billing writes.

Acceptance rows remain unpassed. No retention period, capacity number, or OTP provider was chosen.
```

## Proposed push, not run

```
git push -u origin V13
```

`ci.yml` does not trigger on `V13`. The four V13 workflows stay `workflow_dispatch` with jobs `if: ${{ false }}`. Pushing them does not start a database. QA commit readiness is no. GitHub push readiness is no.
