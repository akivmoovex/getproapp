# V2.13 D17 production repairs

## Fixed

`src/activeclinic/http/activeClinicAppRoutes.js`

`POST /app/select-organization` called `issueAuthenticatedSessionCookie` without an OTP workflow. The other ActiveClinic login and organisation-selection calls already used `activeclinic.staff_login`. The app switch now passes that workflow plus the selected organisation id and platform identity id.

Regression: `tests/v13/unit/d17-platform-http-behavior.test.js` fails if any session-cookie call, other than the password-change refresh, omits `otpWorkflow`. `tests/v13/unit/d17-ac-behavior.test.js` asserts the new call.

## Investigated and not changed

The shared OTP store is process memory. A second `createOtpService` cannot see the first service's challenge. A durable store would need the migration that the existing D14 contract forbids creating, and migration execution is not authorized. Production activation remains `BLOCKED`.

Branch sermon route helpers are not exported. The sermon field builder was tested. The route module was not rewritten only to expose it.

Appointment collision handling queries several repositories. Invalid input and a missing appointment were tested. Conflict persistence was not claimed.

No other failing permitted test established a product defect.
