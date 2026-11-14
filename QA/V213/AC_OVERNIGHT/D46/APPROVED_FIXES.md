# Approved fixes

Three local fixes. Each keeps a predicate the same service already used. None adds a column, a period, or a clinical threshold. None is an acceptance pass.

| Fix | Acceptance IDs | What changed |
|---|---|---|
| Profile event | Portal rows, including the PAT group. Not passed | `updatePatientProfile` returns `patient_not_found` when the organization-scoped update matches nothing. The `profile_updated` event is inserted only from a patient row in that same organization |
| Receipt name | FIN rows. Not passed | `getPatientName` uses `organization_id = tenantId`, the same predicate as `assertPatientInTenant` |
| Invoice charge | FIN rows. Not passed | A pending charge is marked invoiced only when its id, tenant, and facility match. A miss rolls back with `invalid_charges` |

Files: `src/activeclinic/services/activeClinicPatientPortalProfileService.js` and `src/activeclinic/services/activeClinicBillingService.js`. Tests: `tests/v13/unit/d46-isolation-fixes.test.js` and `tests/v13/contract/d46-isolation-contract.test.js`.
