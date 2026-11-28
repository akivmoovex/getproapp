# V2134 G329 local regression

Database for every run that opened PostgreSQL: `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. The runner preflight refuses any other database and refuses the run when any `public_booking_enabled` row is true. Every preflight in this gate passed. No `public_booking_enabled` value was updated. Shared port `5432` and hosted databases were not used.

The counts below are the runs on the settled source.

## Safe and HTTP

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| `npm run test:v13:contract` | 687/687 | 687/687 |
| Focused unit file `tests/v13/unit/g329-public-booking-admission.test.js` plus `d48-appointment-engineering.test.js` and `d17-reception-booking.test.js` | 11/11 | 11/11 |
| `.v13-isolated-pg/g79-run.cjs` HTTP integration | 41/41 | 41/41 |
| `npm run test:v13:otp-security` | 15/15 | 15/15 |

The contract count is 682 from G325 plus the 5 new admission tests.

## Browser

Playwright used `.v13-isolated-pg/g80-playwright.cjs`. The child environment does not set `GETPRO_AC_PUBLIC_BOOKING_ADMISSION`. ActiveClinic listened on `127.0.0.1:4187`. BlessBoard listened on `127.0.0.1:4186`.

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| ActiveClinic `playwright.v13-ac-platform.config.cjs` | 36/36 | 36/36 |
| BlessBoard `playwright.v13-bb-qa.config.cjs` | 23/23 | 23/23 |

AC-PUB-01 passed in both ActiveClinic runs. The page showed `Booking not available`, `Online booking is not enabled`, and `does not take live bookings`. The staff appointment test in the same suite still created the first appointment and rejected the overlapping second one.

The dedicated ActiveClinic email-OTP and BlessBoard member-OTP browser observer suites were not re-run. The OTP security unit suite above passed twice, and the BlessBoard browser suite still passed `D14C OTP session gate stays blocked on existing deployments`.

## Public booking paths that were denied

AC-PUB-01 on the isolated app, with the clinic website published and `public_booking_enabled` left false by the existing `WHERE public_booking_enabled = false` update:

| Request | Result |
| --- | --- |
| `GET /clinics/:clinicKey/book` | HTTP 403. Body contains `Online booking is not currently offered`, `Online booking is not enabled`, and `does not take live bookings`. No `Continue to provider` |
| `POST /clinics/:clinicKey/book` | HTTP 403 with the same unavailable copy |
| `POST /clinics/:clinicKey/book/submit` with `Accept: application/json` | HTTP 403. Body contains `Online booking is not currently offered` |
| `POST /clinics/:clinicKey/book/procedures/general/submit` | HTTP 403 |
| `POST /clinics/:clinicKey/book/submit` with cookie `moovex_platform_testing_sid=g329-patient-session` | HTTP 403. The mount has no signed-in exception, so a real patient session meets the same refusal |
| `GET /clinics/g329-unknown-clinic/book` | HTTP 404 clinic-not-found. No `Continue to provider` and no `method="post"` |

After those requests, `activeclinic.appointments` for that organization stayed 0 and the global `activeclinic.public_booking_requests` count was unchanged.

The unit file, with no database connection:

| Case | Result |
| --- | --- |
| Clinic flag true, platform value unset | `platform_public_booking_disabled` |
| Platform value `1` or `true` | Closed |
| Platform value exactly `enabled` on testing, clinic flag false | `clinic_public_booking_disabled` |
| Platform value exactly `enabled` on testing, clinic flag true | Admitted. This proves a later activation can open. It is not an approval to set the value |
| Production deployment signals with the value present | Closed |
| `createConsultationBookingRequest` and `createProcedureBookingRequest` with a testing env and no admission value | `booking_not_enabled`, `booking: null`, zero queries. The procedure input also carried a true clinic-shaped flag and still made no query |
| `activeClinicAppointmentRoutes.js` and `activeClinicAppointmentService.js` | Do not reference `publicBookingAdmission`. `createAppointment` remains a function |

HTTP `D25-STAFF-CONCURRENCY` passed in both isolated HTTP runs. It calls `createAppointment` on `getpro_v13_e2e_g78d2301` and keeps the assigned-staff overlap rule.

`validateCsrf` remains on the public submit handlers. BlessBoard browser `BB-MEM-02` still rejects a missing CSRF token. Unknown-clinic and wrong-clinic browser cases still refuse the foreign tenant.

## What this does not prove

These runs do not prove the hosted checkout. Hosted workers are still on `d5c5369d22fd825938fe1a9692dadee19bfd4a93`, which does not contain this patch. A passing local unavailable page would not have been enough on its own. The POST and service denials above are the admission control.
