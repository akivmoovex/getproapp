# Patient features

No product file was changed. The approved patient behavior was already in the services, and D86 adds tests that lock it.

| Behavior | Source | Test |
|---|---|---|
| Staff create does not require a portal | `assertPatientDoesNotRequirePortal` | `d86-patient-facility.test.js` |
| Patient number stays `AC-YYYY-NNNNNN` | `assertPatientNumberPolicy` | The same file rejects `NATIONAL-1` |
| A blank number can be allocated | `assertPatientNumberPolicy("")` | The same file |
| Duplicate rows from another organization are dropped | `findPotentialPatientDuplicates` | Existing D72 test |
| Registration does not open a session | `activeClinicPatientPortalRegistrationService.js` | `d86-patient-facility-contract.test.js` |
| No merge function | Patient service and domain service | The same contract |

Merge stays unapproved under D21-03. A new national-id or other identifier rule stays unapproved under D21-04. Public self-registration was not added. Registration sentences were not unified.
