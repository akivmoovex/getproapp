# V2.12 ActiveClinic Final Three Scenarios

Status: `PARTIAL / BLOCKED`

Foundation checks passed: V12 HEAD is `07f4fcdfd9f7ab22585b59e3cbebf608b4569687`, and the ActiveClinic application/PostgreSQL containers are attached only to `v212-qa-internal`.

## AC-05 — Admin Console authorization

- Unauthenticated `GET /admin/settings/test-database` -> 404.
- Unauthenticated preview URL -> 404.
- Super Admin page/API access: `BLOCKED`; no supported platform Super Admin fixture was available in the ActiveClinic disposable database.
- Tenant administrator denial: `BLOCKED` for the same missing platform-console fixture.

The 404 responses are an application product-route boundary in the ActiveClinic foundation server, not a successful Admin Console authorization result.

## AC-04 — Cross-tenant isolation

`BLOCKED` at the first prerequisite: the current disposable database contains the seeded ActiveClinic organization and its records, but no complete second-clinic patient/appointment fixture suitable for both-direction browser/API access. No cross-tenant result is promoted to PASS.

## AC-01 — Patient portal linking

`BLOCKED` at the first prerequisite: `activeclinic.public_booking_requests` count is 0 and `patient_portal_link_events` count is 0. The supported `registerPatientWithGuestToken` contract requires a booking request with a verified access token and deliberate patient association. Existing patient-portal service tests are separate evidence and do not prove this browser acceptance scenario.

## Disposition

No confirmed product defect was established by these runs. The three scenarios remain QA fixture/authorization-evidence blockers. Previous AC-02 appointment persistence and AC-03 logout evidence remain preserved in the acceptance reports.

Phase 5B executed the supported demo-clinic audit successfully. It confirmed both clinic organizations and facilities, but the available role seed remains scoped to `activeclinic-demo`; no supported Clinic-B staff/patient/appointment bootstrap, shared-platform Super Admin bootstrap, or verified booking-request/token bootstrap was available.
