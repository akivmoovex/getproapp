# V211-BB-QA145 Valid Registration and Authorized Invitation

## Member registration

The canonical public route is `GET /register` and `POST /register` through
`tenantRegistrationRoutes.js`; it is ordinary church-member registration, not
church onboarding or member-portal invitation acceptance.

Using a persistent Supertest agent, the tenant forwarded-host configuration,
and server-issued `blessboard_org_csrf` cookie/hidden field:

- GET form: `200`
- valid POST: `303` to `/register/submitted?ref=<opaque UUID>`
- one registration persisted with status `submitted`
- persisted church and branch matched the QA75 synthetic church/branch
- no automatic member activation occurred

The first invalid-CSRF probe in QA143 lacked the canonical forwarded host and
cookie/form pairing. The route source explicitly returns `403` from its
`validateCsrf` branch; that earlier `200` is not classified as a bypass.

## Staff invitation

Using the existing QA75 HQ administrator session:

- GET `/hq/settings/staff-access/invite`: `200`
- explicit session and CSRF-cookie POST: `200`
- an invited user record was created with status `invited`

The generated raw invitation URL/token was not logged or persisted in this
report. Acceptance/setup, invited-staff login and role-dashboard verification
were not completed because the response did not expose a safely capturable
link through the current harness. An earlier request without the explicit
session cookie returned `303` to `/login?next=...`, confirming controlled
unauthorized handling.

No product source, migration, reset, protected database mutation, commit,
push or deployment was performed.
