# G156 appointment concurrency

Both authorized HTTP runs on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432` included the D25 file.

Passed in both runs:

- Same-staff overlap inside the appointment transaction.
- One of two concurrent same-staff bookings wins.
- A retry after the collision stays rejected.
- A different staff member can book the same interval.
- The next touching interval succeeds.
- The other clinic is rejected in the ActiveClinic auth integration that stores one appointment.

Failed in both runs, unchanged:

- Simultaneous slot booking stays `APT-01-03_NOT_IMPLEMENTED`.
- `evaluateSlotCapacity` still returns `BLOCKED_APPROVAL_REQUIRED` with `capacity: null`.
- `createAppointment` does not call that function. No capacity integer was added. The failing test was not weakened.

The browser file also rejects a second booking in the same slot through the UI. That UI collision is the overlap rule, not an approved room capacity.
