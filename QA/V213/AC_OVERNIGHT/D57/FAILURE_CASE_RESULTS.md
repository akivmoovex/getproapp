# Failure case results

| Dependency | Observed result |
|---|---|
| Facility query throws `db_not_allowed` | The rejection message is that error. No facility is invented |
| Appointment block query throws after no appointment row | The function returns null. The earlier appointment row is not discarded, because that path returns before the block query |
| Document query throws `db_not_allowed` | The rejection message is that error. The narrative is not added to it |
| Portal and encounter checks fail closed | The database function is not called, so there is no connection error to hide |
| Payment `connect` throws if called | It is not called. The denial does not include the note or the idempotency key |
| OTP public payload | `1234` is not present after verify, expiry, or a wrong purpose |

A rolled-back payment insert is still not observable. The denial happens before `BEGIN`. The duplicate-key branch remains the source check in the earlier billing contract.
