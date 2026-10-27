# V211-QA136 BlessBoard Registration and Staff Invitation

## Result

Existing coverage was identified for member registration, CSRF and staff
invitation (`tests/blessboard-staff-invitation.test.js` and the registration
service/route suites). The staff invitation suite provisions its own
foundation database through `resetFoundationDatabase()` and migrations, so it
was not executed under the QA136 no-reset/no-migration constraint.

No dedicated QA136 browser or HTTP test was added. The current browser
harness remains blocked by the unresolved application-profile redirect loop.
Accordingly valid registration, invalid-CSRF denial, staff invitation setup,
activation, login, replay, expiry, wrong-church and privilege-boundary
statuses are not claimed.

No raw token, credential or session data was recorded. No product source,
migration or database was changed.
