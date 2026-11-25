# V2.13.2 G137 — D25 concurrency results

Branch `V13`. Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. The focused run and both later HTTP runs confirmed `current_database()` and `platform.database_identity`. Shared PostgreSQL was not used. No migration was executed.

## Why slot fails and overlap passes

These are different decisions.

D21-05, in `QA/V213/AC_OVERNIGHT/D85/DESIGN_APPROVAL_REGISTER.md`, has no approval. The allowed action is still "do not add a slot lock or a capacity number." `evaluateSlotCapacity()` returns `BLOCKED_APPROVAL_REQUIRED`, `capacity: null`, and `slot_capacity_not_approved`. `createAppointment` does not call it. The appointments migration has no capacity column and no exclusion constraint.

The D25 slot test throws `APT-01-03_NOT_IMPLEMENTED` before any booking. That failure is the hold. It was not weakened. Calling the blocked helper from create would refuse every appointment, which is not an approved capacity rule.

Same-staff overlap is the rule already implemented in G132. `createAppointment`, `updateAppointment`, and `rescheduleAppointment` take `pg_advisory_xact_lock` after `BEGIN`, then `findStaffCollision`, then the write. A collision rolls back. The overlap query matches assigned staff, organization, and healthcare organization, and it uses `starts_at < end AND ends_at > start`, so a visit that starts when the previous one ends is not an overlap. A different staff id uses a different lock key.

## Repair that lets the approved lock run

Two simultaneous first bookings of a patient who is not yet linked to the facility both inserted `activeclinic.patient_facility_links` and one hit `patient_facility_links_active_uidx`. That exception happened before the appointment transaction, so the staff lock was never taken. `createAppointment` now ignores only that constraint and continues to the existing lock. Other database errors still throw. This is not a capacity number.

## Tests

`tests/v13/unit/g137-appointment-rules.test.js` checks the unapproved capacity result, adjacent versus overlapping intervals, staff-only overlap, and idempotent retry without a slot lock.

`tests/v13/contract/d25-appointment-concurrency-contract.test.js` still forbids `FOR UPDATE`, `slot_capacity`, and now also `evaluateSlotCapacity` on the appointment service.

`tests/v13/integration/d25-appointment-concurrency.integration.test.js` opens two clients on the disposable database. One same-staff booking wins, the other returns `appointment_collision`, and a retry stays rejected. The appointment count stays 1 after that collision. The next touching interval succeeds. A different staff member succeeds for the same interval. The other clinic's appointment count stays 0. The owned clinic ends with 3 rows.

Focused D25 run: slot failed as required, overlap passed, concurrent test passed. Both full HTTP runs repeated that same split.

## Decision still required

D25 slot stays `BLOCKED_APPROVAL_REQUIRED`. An approval has to name:

1. The integer capacity, if a facility or service may hold more than one visit at a time.
2. Whether that integer is different from one overlapping visit per assigned staff member.
3. Whether an unassigned visit counts toward it.
4. Where that integer already lives. No new column was added.

Until then, no room capacity and no public booking change.
