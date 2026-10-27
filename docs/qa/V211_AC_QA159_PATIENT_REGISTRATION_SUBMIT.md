# V211-AC-QA159 Patient Registration Submit

## Contract inspection

The canonical staff registration route is `GET/POST /app/patients/new`.
The route uses the ActiveClinic patient form service and renders
`views/activeclinic/app/patient-form-content.ejs`. On the review step, the
template explicitly renders an enabled `Create patient` submit control:

`POST /app/patients/new` with `step=confirm`

The controller then calls `registerActiveClinicPatient`, returning the
patient-success screen with the patient profile link. The flow is distinct
from patient-portal self-registration.

## Verification

The rendered template contains the visible review control and the patient UI
parity suite passed 4/4, including registration, duplicate warning,
facility/CSRF/role denial, and patient editing.

The broader MF08 registration suite could not complete its database setup:
four subtests failed before workflow execution with a local PostgreSQL
duplicate-database setup error (`pg_database_datname_index`). This was test
environment setup failure, not a missing submit control or product rejection.

No product source change was justified or made. No reset, migration, protected
database mutation, commit, push, or deployment occurred.
