# G2 and G3 readiness

Nothing here was executed. A prepared file is not a pass.

| Evidence | File | Gate | What it still has to prove |
|---|---|---|---|
| G2 portal | `tests/v13/integration/d24-patient-portal.integration.test.js` | Both database flags and the local database guard | Empty registration returns `invalid_input`. It does not insert a patient |
| G2 appointments | `tests/v13/integration/d25-appointment-concurrency.integration.test.js` | Same gate | The body throws `APT-01-03_NOT_IMPLEMENTED` |
| G2 OTP | `tests/v13/integration/d16-platform-otp.integration.test.js` | Same gate | `platform.otp_challenges` is absent. A second worker cannot pass |
| G3 AC-05 | `tests/e2e/v13/v13-ac-platform-qa.spec.js` | Browser flag and `E2E_DATABASE_URL` | The test calls `hold()` first. A later 403 would still need a real lower-privilege session |
| G3 portal | Same spec, PAT-01 case | Same browser gate | Held. Wrong-clinic copy is not persistence |
| G3 appointments | Not a live overlap test | Browser flag | No browser case creates two concurrent bookings |

AC-05 live denial, portal persistence, and appointment concurrency persistence stay not run. OTP production stays unapproved. Do not open the gates to turn these files green.
