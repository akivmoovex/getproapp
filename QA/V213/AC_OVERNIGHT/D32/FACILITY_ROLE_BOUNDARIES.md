# Facility role boundaries

Facility reads in `facilityRepository.js` bind `organization_id`. A facility id alone is not the query key for the id lookup.

ActiveClinic roles stay in the catalogue from migration `088`. Organization admin does not receive clinical or finance write by default. Facility admin is limited to assigned facilities. Reception, nursing, and clinician keys are separate. `activeclinic.patient.merge` is removed from every ActiveClinic role.

A facility-scoped grant without a facility id already returns `invalid_scope` in the D31 test. That is role assignment, not a live wrong-facility encounter denial.

D21-01 is still pending. This stage does not add a permission and does not widen a role to force a test.
