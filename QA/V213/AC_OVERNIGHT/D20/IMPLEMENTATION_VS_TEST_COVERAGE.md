# Implementation versus test coverage

Committed V13 ActiveClinic runtime is the V12 clinical code plus the public about-page version string.

Uncommitted ActiveClinic edits are OTP session arguments on existing login, portal, lifecycle, and role-assignment paths. They are not new clinical features. The OTP module itself is shared platform code and is not activated.

The 84 acceptance cases are all `NOT_RUN` in the traceability CSV. D19 added:

- 5 ActiveClinic browser tests, prepared, not executed. One of them requests `GET /app/billing` and `POST /app/billing/invoices` after a receptionist sign-in. That is the prepared AC-05 check. It has no run result.
- 1 ActiveClinic database runner, `runAcAuth`, prepared behind the write gate and not executed. It is written to deny an organisation-scoped receptionist, store one appointment, and reject a second booking in the same slot.
- BlessBoard and platform runners and browser tests that do not close ActiveClinic acceptance rows.

In-process D17 role and appointment checks are not the 84-case matrix and do not close AC-05, patient activation persistence, or appointment conflict persistence.

| Question | Evidence |
|---|---|
| New committed ActiveClinic feature | No |
| Uncommitted ActiveClinic behavior change | OTP hold and workflow tags only |
| AC browser tests | 5 prepared, 0 executed |
| AC database integration tests | 1 runner prepared, 0 executed |
| AC-05 live denial | Not run |
| Patient activation persistence | Not run |
| Appointment conflict persistence | Not run. Staff-overlap code exists in `createAppointment`. The D19 collision runner was not executed. |
