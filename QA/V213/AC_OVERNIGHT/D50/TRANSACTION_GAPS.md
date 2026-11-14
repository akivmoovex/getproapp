# Transaction gaps

These writes still commit the business row and the audit as separate steps. There is no outbox table and none was added.

A later design, still unapproved, would need:

1. The existing business update and a row in an existing event table, in the same transaction.
2. A named consumer that is allowed to send that event. No consumer is named here.
3. What happens when the consumer fails. The business row must stay. No second payment is created.

Until that exists, a crash after commit and before the audit can leave the row without the audit event.

Still not protected by a database session in this stage:

| Gap | Why it stays |
|---|---|
| Two staff appointments | The overlap check is outside the transaction. D21-05 is pending |
| Two payments with a new key | The idempotency key stops only a repeated key in the same tenant |
| Critical escalation | D21-06 is pending. No timer was added |
| Substitution and allergy block | D21-07 and D29-17 are pending |
| Cashier reversal | D21-08 is pending |

The in-memory collect test rolls back when the pending update matches nothing. That is not two database sessions.
