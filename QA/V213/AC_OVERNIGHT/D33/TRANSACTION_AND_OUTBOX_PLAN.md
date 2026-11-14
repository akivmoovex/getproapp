# Transaction and outbox plan

This is a proposal. No table and no service was added.

Gaps:

- Order handoff has no rollback when a department step fails.
- Critical acknowledgement updates the newest alert, so two results can share one acknowledgement.
- Payment idempotency is a row lookup inside one transaction. It is not a proven multi-worker test.
- Billing, pharmacy, and diagnostics services do not write an outbox.
- A failed dispense or payment path that already opened a transaction does roll back that transaction. That does not publish a compensating event.

Later isolated-database designs, still not run:

1. Two payments with the same idempotency key. Expect one insert and `duplicate_submission` on the second, with the first balance unchanged.
2. A cashier session calling reversal. Expect denial and no reversed amount.
3. Two critical results. Expect the acknowledgement to name the result that was passed, after D21-06 changes the lookup.
4. A submitted order whose result insert fails. Expect the order not to sit in a half-handed state, after D21-02 approves that transaction.

Outbox, if later approved under ACX-007, would record an event only after commit and would store identifiers rather than clinical text. No outbox migration is authorized.

Approvals still required before any of that work: D21-02, D21-06, D21-07, D29-17, and D21-08. The rest of the 18-decision register stays pending as well.
