# Outbox and transaction proposal

Status: not implemented. Billing, pharmacy, and diagnostics source still contain no outbox write.

An outbox would need an approved table, the event names, and the rule for rolling back the clinical write when the event insert fails. None of those names is approved. No migration file was added.

The same hold covers these database tests. They are specified here and were not executed:

| Case | Expected stored result |
|---|---|
| Result on a cancelled laboratory request | No result row. Status stays `cancelled` |
| Acknowledgement for a result in another organization | No alert changes status |
| Two active alerts for one patient | Only the newest active alert for that patient changes, until a result link exists |
| Dispense stock row in another organization | The lock finds no row and the dispense rolls back |
| Same idempotency key, other tenant | A new payment may proceed. This tenant’s key still returns `duplicate_submission` |

Critical-result escalation, substitution, and an allergy block stay out of this proposal. They are separate approvals.
