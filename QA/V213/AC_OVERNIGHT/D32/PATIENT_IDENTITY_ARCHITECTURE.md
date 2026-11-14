# Patient identity architecture

Package B in `QA/V213/AC_OVERNIGHT/D29/FULL_84_CASE_TRACEABILITY.csv` has 9 IDs, not 18. The 18-row package in that file is G. Membership used here is the CSV.

| ID | Existing behavior | Missing |
|---|---|---|
| TEN-01-01 | Facility rows are stored with an organization | Ownership was not executed |
| TEN-01-02 | Facility reads include `organization_id` | Live denial without disclosure was not run |
| TEN-01-03 | Product context and permission middleware exist | Fail-closed missing tenant on every clinical route was not proven |
| ID-01-01 | A non-match decision is `ALLOW` | Opening a second encounter without changing the first was not executed |
| ID-01-02 | Exact identifier is `BLOCK` with no override. Name-only is `WARN`. A stronger duplicate is `WARN_REVIEW` | No database review queue was run |
| ID-01-03 | Identifiers can be stored | No approved rule for a patient with neither phone nor national ID |
| ID-02-01 | `activeclinic.patient.merge` is assigned to nobody | No merge service, lineage, or audit of a merge |
| ID-02-02 | The same unassigned permission denies every role, including reception | The denial was not executed |
| ID-02-03 | No hold workflow | Conflicting-match review and unmerge are absent |

`activeClinicPatientDuplicateService.js` states that detection is a warning workflow and does not merge. The duplicate policy actions are `ALLOW`, `WARN`, `WARN_REVIEW`, and `BLOCK`. None of those actions is a merge.

Do not add a merge writer, an unmerge writer, or an identifier rule until D21-03 and D21-04 are approved.
