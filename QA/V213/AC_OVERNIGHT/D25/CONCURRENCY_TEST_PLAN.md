# Concurrency test plan

In-process tests cover the behavior that exists. Database and browser runs stay held.

| Scenario | Where it was checked | Result |
|---|---|---|
| Synthetic plan refused | `buildAppointmentConcurrencyPlan` and `applyActiveClinicFixtures` | Hold thrown, no query |
| Assigned-staff overlap | `findStaffCollision` with a returned row | `kind: appointment` |
| No assigned staff | `findStaffCollision` | No query, null |
| Other organization | Same function, other organization id | Null |
| Two empty checks | Two calls, no lock text | Both null. Design gap, not APT-01-03 pass |
| Invalid facility and wrong-tenant create | Source of `createAppointment` | Not executed against a database |
| Duplicate public booking | `findPublicBookingByIdempotencyKey` | Same organization returns `duplicate: true`. Other organization is `not_found` |
| Stale version | `updateAppointmentByOrgAndId` | Null row when the version predicate matches nothing |
| Cancelled retry | `assertStatusTransition` with the service map | `confirmed` to `cancelled` allowed. Reverse denied |
| Missing capacity | Migration and service source | No capacity column and no capacity symbol |
| Transaction rollback | Service source | `ROLLBACK` is present on the stale-version path. Not executed |
| Simultaneous booking | `d25-appointment-concurrency.integration.test.js` | `NOT_RUN`. The body throws `APT-01-03_NOT_IMPLEMENTED` if the gate is opened |

The existing browser appointment test remains held. It was not launched. It looks for a collision message and does not prove capacity.

Safe later sequence, after a separate approval:

1. Choose staff-slot exclusion, facility capacity, or both.
2. Move the overlap check into the insert transaction and add one lock or constraint.
3. Run two concurrent creates on a disposable database and expect one success.
4. Repeat after cancellation and expect the freed staff slot to accept one new row.
5. Keep the public booking idempotency key as a retry control, not as capacity.
