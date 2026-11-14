# Capacity and locking proposal

Status: `BLOCKED_APPROVAL_REQUIRED`. D21-05 is still pending. This document does not choose a capacity number, a column, or a migration name.

## What exists

| Fact | Evidence |
|---|---|
| Overlap predicate | Same staff, same organization, status in `requested`, `confirmed`, `arrived`, `waiting`, `with_practitioner`, and the intervals overlap |
| Adjacent intervals | `09:30` after `09:00–09:30` is not an overlap |
| Unassigned visits | No overlap query |
| Transaction | The check is outside `BEGIN`. The insert is inside it |
| Version | An update with the wrong `expectedVersion` changes zero rows |
| Public retry | Unique `(organization_id, idempotency_key)` on a booking request |
| Capacity store | None in the appointment service or the D25 schema contract |

## What a later approval would have to name

1. Whether one staff member may hold one overlapping visit, which is the current rule, or some other count.
2. The number, if any, and whether it is per staff member, per room, or per service.
3. Whether the overlap check moves inside the same transaction as the insert, and which existing row would be locked. No new table is proposed here.
4. Whether a lost race returns `appointment_collision` or a different code. The current code is `appointment_collision`.
5. That public booking idempotency stays a retry of the same request and does not become the capacity lock.

Until those names exist, the pure capacity result stays null and the overlap query stays where it is.
