# V2134 G329 public booking policy patch

FINAL=V2134_G329_LOCAL_BOOKING_PROTECTION

BASE_SHA=`d5c5369d22fd825938fe1a9692dadee19bfd4a93`  
BRANCH=`V13`  
WORKTREE=`~/Development/getproapp-v13`  
COMMIT=NO  
PUSH=NO  
HOSTED_DEPLOYMENT=NOT_PERFORMED  
MAIN_UNCHANGED=YES (`44eafec486a18aeef2777bbcc9683e43f68ebe0d`)  
HOSTED_DB_WRITES=NO  
PUBLIC_BOOKING_FLAGS_CHANGED=NO  

This file is local and uncommitted. `docs/qa/V2134_G328_HOSTED_SAFETY_AUDIT.md` remains untracked. No Hostinger setting, worker, hosted database, or `public_booking_enabled` value was changed.

## What closed

G328 confirmed that a clinic row with `public_booking_enabled = true` rendered a live public wizard and that submission had no separate platform stop. This patch adds one fail-closed admission contract in front of new public booking.

The contract lives in `src/activeclinic/services/publicBookingAdmission.js`.

| Input | Result |
| --- | --- |
| `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` unset, empty, `1`, or `true` | Closed |
| Exact value `enabled` on a testing deployment, and the clinic flag is strictly true | Open, for a future approved activation |
| `DEPLOYMENT_ENV`, `DATABASE_IDENTITY_ENV`, or `EXPECTED_DATABASE_ENV` is `production` | Closed, even when the value is `enabled` |
| `PLATFORM_DEPLOYMENT_CODE` is `moovex-platform-production` | Closed, even when the value is `enabled` |
| `NODE_ENV=production` while the deployment identity stays testing | Still able to open later, because the testing host already runs Node in production mode |

This patch does not set `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` and does not approve setting it. A clinic row cannot open admission by itself.

## Where it is enforced

1. `registerActiveClinicPublicBookingRoutes` mounts `app.use("/clinics/:clinicKey/book")` before the wizard. GET and POST, including `/book/submit` and `/book/procedures/.../submit`, resolve the clinic for the page and then return HTTP 403. An unknown clinic key returns the existing HTTP 404 clinic-not-found page, with no booking form.
2. `resolveBookableClinic` checks the same contract after the clinic resolves, so a later caller of that function still refuses.
3. `createConsultationBookingRequest` and `createProcedureBookingRequest` return `{ ok: false, code: "booking_not_enabled", booking: null }` before any query when the contract is closed.

The unavailable page title is `Booking not available`. The lead is:

`Online booking is not currently offered. Online booking is not enabled for this clinic yet. Use the contact page to request an appointment — this page does not take live bookings.`

The friendly page is the visitor explanation. The control is the HTTP 403 and the service return that happens before an insert. Both were tested.

## Paths that stay available

| Path | Behavior |
| --- | --- |
| Staff `createAppointment` in `activeClinicAppointmentService.js` and `activeClinicAppointmentRoutes.js` | Unchanged. Those files do not reference the admission contract |
| `/clinics/:clinicKey/my-booking`, cancel, and reschedule | Outside the `/book` mount. Existing requests can still be looked up |
| Patient portal list, detail, cancel, reschedule, and link-guest-booking | Unchanged. Those routes do not call the public create functions |
| Existing `activeclinic.appointments` and `activeclinic.public_booking_requests` rows | Untouched by a denied request |
| Clinic-flag 403 and `validateCsrf` on the submit handlers | Still in the route file, for the day an approved activation opens the contract |

While the platform value is unset, a website editor who opens `/clinics/:clinicKey/book` sees the same unavailable page. Staff scheduling uses the appointment routes, which this patch does not enter.

## Local files in this patch

| File | Change |
| --- | --- |
| `src/activeclinic/services/publicBookingAdmission.js` | New fail-closed contract |
| `src/activeclinic/services/activeClinicPublicBookingService.js` | Both create functions return before a query |
| `src/activeclinic/http/activeClinicPublicBookingRoutes.js` | Middleware and resolver refusal, with the unavailable page |
| `tests/v13/unit/g329-public-booking-admission.test.js` | Decision matrix, direct-call denial, staff isolation |
| `tests/v13/unit/d48-appointment-engineering.test.js` | Passes the exact testing value only as that test's input, so the retry case can still reach its mock insert |
| `tests/v13/integration/d05RegressionRunners.js` | AC-PUB-01 covers GET, POST, direct submit, procedure submit, a patient cookie, an unknown clinic, and unchanged request counts |

`d48` does not set the value on the process. The application default remains closed.

Regression counts are in `docs/qa/V2134_G329_LOCAL_REGRESSION.md`. The deployment hold is in `docs/qa/V2134_G329_CONTROLLED_DEPLOYMENT_REQUEST.md`.
