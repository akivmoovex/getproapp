# V2.13 D19 test implementation

HEAD `b8f6b420d25e908de64ba292866c218c32edc30c` on `V13`. No database was opened and no browser was launched.

## What changed

The 11 integration files now call real runners in `tests/v13/integration/v13AuthorizedScenarios.js`. Each runner uses the application services: church provisioning, homepage sections, announcements, events, sermons, the staff add-member flow, member portal invitations, public enquiries, staff invitations, ActiveClinic role assignment, appointment creation, and the OTP service. `runGated` records `NOT_RUN` unless both write flags are set and the connection string passes the disposable-database guard.

The 14 BlessBoard browser tests and 5 ActiveClinic browser tests now fill the real form controls. They throw `NOT_RUN` unless browser authorization, both write flags, and a local disposable `E2E_DATABASE_URL` are present. A `/healthz` visit is not a pass. AC-05 signs in as the receptionist and requests `GET /app/billing` and `POST /app/billing/invoices`. The expected statuses are 401 or 403, and the body must not contain the billing catalog.

## Execution this task

Stage A (contracts, unit, HTTP, security, OTP, CSRF, mutation probes): 173 passed, 0 failed.

Integration discovery: 11 records, all `NOT_RUN`.

Browser journeys: 19 not started.

## Still not evidence

An authorized integration run has not happened, so persistence, the first INV-01 session, and the live AC-05 denial are not closed. The OTP runner fails closed until `platform.otp_challenges` exists and a second worker can read the same challenge. That migration is not created or applied here.
