# V211-BB-QA144 CSRF and Invitation Triage

## Registration

The V2.11 canonical registration handler is
`src/blessboard/http/tenantRegistrationRoutes.js`, `POST /register`. Its
explicit invalid-CSRF branch calls `validateCsrf`, logs `csrf_fail`, renders
the registration form and returns HTTP `403`.

The QA143 request returned HTTP `200`, but it did not establish the required
server-issued CSRF cookie/form pair and did not submit a valid registration
payload. No member or registration mutation was observed. This is therefore
not classified as a CSRF bypass. The result is `UNVERIFIED/TEST_SETUP_DEFECT`
pending a cookie-preserving request against the canonical V2 route.

## Staff invitation

The canonical HQ staff form is:

`GET /hq/settings/staff-access/invite`

With the existing QA75 administrator session it returned `200`. An
unauthenticated POST returned `303` to the login flow, with no invitation
created. This is a controlled authorization redirect, not an authorization
bypass.

## Browser

The local browser origin remains `http://127.0.0.1:4175`; the tenant host is
carried by the configured forwarded-host routing context. The authenticated
HQ cookie was not transferred into a browser context in this phase, so the
Invite Staff control and full activation flow remain unverified.

No product source, migration, reset, protected database mutation, commit,
push or deployment was performed.
