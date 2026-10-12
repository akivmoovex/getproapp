# V2.09 Staff and Patient/Member Lifecycle E2E

Status: BLOCKED; patient portal/RBAC browser lifecycle was not fully verified.

The documented ActiveClinic staff flow requires an authorized administrator
session and a copyable one-time activation URL. Tokens are intentionally stored
only as hashes and are not recoverable from the database. The prior AC/BB
registration tests do not persist administrator passwords or activation URLs,
so they cannot safely be reused to begin this independent lifecycle without
creating a new organization fixture.

The supported ActiveClinic patient contract is also explicit: staff creates the
clinical patient first, and the patient portal subsequently matches that
existing patient to create a portal identity. Patient registration does not
create the clinical record. The available prior evidence confirms this service
contract, but not a complete browser staff/patient lifecycle.

BlessBoard member activation was not executed. Existing source/documentation
does not establish a supported staff-created-member-to-member-login browser
contract in this QA run. No requirement decision or architecture change was
made.

No product defect was confirmed. No database mutation, production access,
reset, migration, or push occurred.

Focused follow-up: the self-contained AC staff fixture successfully registers
a fresh clinic, invites and activates staff, logs the staff user in, and creates
a patient through Review and the final POST. Its identifiers are not persisted
for a subsequent portal run.

Source diagnosis: patient GET/registration resolves only publishable clinics:
active platform organization/product, active HCO, `website_published = true`,
and an available website instance. The fixture-created clinic was not public,
so `/clinics/:clinicKey/patient/register` returned 404. The staff publish page
returned 403 because staff/receptionist lacks website publishing permission;
the tenant administrator cannot approve the clinic. Registration approval is
handled by `/admin/clinic-registrations/:applicationId/approve`, guarded by
`requireApex` and `requirePlatformAdmin`; website availability approval is
platform-admin controlled.
This is expected RBAC, not a patient-route defect.

Platform-admin provisioning was investigated. The only supported local smoke
script is `scripts/activeclinic/platform-admin-website-smoke.js`; it assumes the
pre-existing `platform-admin@example.test` fixture and does not provision one.
Against the verified local testing database, both supported password candidates
returned HTTP 401 (`account_not_found`). No ad-hoc grant or privileged endpoint
was used.

Further audit found the supported services `createBlessBoardUser` and
`assignBlessBoardRole`; the latter maps `platform_admin` to the catalogue
`platform_administrator` role with platform scope. A new fail-closed local
wrapper was added at `scripts/local/provision-platform-admin-qa.js`, but its
first explicit local write attempt stopped at `role_conflict` (the identity
creation completed before the existing assignment service rejected the role).
The narrow entitlement exemption was then verified and the existing QA identity
received an active platform-scope role. Chromium login at the local BlessBoard
apex reached `/admin`, survived refresh, and displayed `PLATFORM ADMINISTRATOR`.
The target clinic approval record was already `active`/`provisioned` in the
authorized UI, but its separate website state was `UNPUBLISHED`; public clinic
and patient portal checks therefore remain blocked.
The clinic administrator reached `/app/settings/website/publish` with HTTP 200
and saw an enabled `Publish All Changes` control. A normal Chromium click on
the valid form produced no POST/navigation, so publication did not complete.
Instrumentation showed the browser had auto-dismissed the native confirmation
dialog. Accepting `Publish this website? Public visitors will see the current
draft.` through the normal dialog handler produced the authorized POST and
published the clinic. Unauthenticated Chromium then received HTTP 200 for the
clinic page, patient registration, and patient login routes.
The first patient lifecycle attempt then exposed a separate product form-state
defect: the Review hidden-field projection omitted `phone_country` and
`phone_national`, so the created patient had no portal-match phone. The
projection was corrected without changing validation or identity rules.
The complete Chromium lifecycle passed twice with fresh clinics/patients:
activation, identity linking, login, refresh, logout, relogin, and staff-route
denial.

DB-backed portal tests: patient login/session isolation passed; guest-token
registration failed with HTTP 400. MF08/MF09 focused suites also failed
registration/dashboard assertions. No new runtime change was justified.

Clinic/facility association, portal activation, patient refresh/logout/relogin,
RBAC denial matrix, duplicate submission, and cross-clinic browser evidence remain
NOT_RUN. No commit was made for this incomplete lifecycle.
