# Appointment concurrency plan

Concurrency was not run. `buildAppointmentConcurrencyPlan` sets `persisted: false` and `capacity: null`.

The slot is `2026-12-01T09:00:00.000Z` to `2026-12-01T09:30:00.000Z`, timezone `Africa/Lusaka`, staff id `abababab-abab-4aba-8aba-abababababab`, on facility A. A touching slot that starts at `09:30` is not an overlap. Clinic B must not see clinic A’s row.

When authorized, insert one confirmed appointment for that staff and slot, then attempt a second overlapping insert. The expected code is `appointment_collision`. Then repeat the second insert from clinic B and expect it to be allowed only if the staff member belongs to clinic B. An unassigned appointment must not run the overlap query.

The existing gated test `D39-STAFF-OVERLAP-RACE` returns `NOT_RUN` while the flags are off. If the flags are turned on before a transactional lock is approved, that body throws `BLOCKED_APPROVAL_REQUIRED` and must not be counted as a pass. `APT-01-03` still throws `APT-01-03_NOT_IMPLEMENTED` because no capacity number exists.

Do not add a capacity, a slot lock, or a migration to make either test green.
