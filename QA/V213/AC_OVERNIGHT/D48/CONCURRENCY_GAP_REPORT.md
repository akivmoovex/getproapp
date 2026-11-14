# Concurrency gap report

The in-memory test can make one insert throw `23505` and the next read return a row. That shows the recovery branch. It does not show two database sessions, and it does not show that a second staff appointment is refused.

| Gap | Current behavior |
|---|---|
| Staff overlap | Two checks can both see an empty slot, then both insert. The check is outside the transaction |
| Slot capacity | No number, no column, and no exclusion constraint |
| Appointment create | No idempotency key on `appointments` |
| Public booking retry | The unique key now returns the stored request after `23505`. It does not reserve the staff slot |
| Status update | `expectedVersion` can lose. The loser gets `stale_version` |
| Gated race test | `D39-STAFF-OVERLAP-RACE` stays `NOT_RUN`. If the database flags are opened first, its body throws `BLOCKED_APPROVAL_REQUIRED` |

Persistent concurrency is not verified.
