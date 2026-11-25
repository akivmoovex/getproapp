# G203 financial architecture

`planLedger` requires an idempotency key. The same key returns the existing plan. Contribution is the integer proration of the paid amount over the quoted amount. `planRefund` stores the negated contribution under `key:refund` and does not commit it. A zero contribution stays zero rather than negative zero.

`commitLedger` audits `ledger.refused` and returns `posting_disabled`. `store.ledger` stays empty. There is no wallet and no personal monetary credit.

Disabled agreements do not reach a contribution plan because eligibility is not `ELIGIBLE`. An unsupported model throws `unsupported_model` from `calculateBenefit`.

No live posting was performed.
