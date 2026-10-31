# V2.12 Approved Scope Implementation

The approved policy keeps public booking optional and disabled by default.
Portal activation must use the existing staff-created patient workflow.

The existing supported contract is `POST
/clinics/:clinicKey/patient/register` without a guest token. It matches an
active staff-created patient by tenant-scoped normalized phone plus first and
last name, creates the patient identity with a password, links the identity to
the patient profile, and records `linked_via_phone_match`. Public booking is
not involved.

No product runtime change was required. The acceptance scenario was corrected
to exercise this existing contract. Public booking was not enabled.

The Phase 5H BlessBoard correction is limited to explicit run-scoped
`host_slug` values for the two synthetic branches. It is test-only and
preserves all existing assertions.
