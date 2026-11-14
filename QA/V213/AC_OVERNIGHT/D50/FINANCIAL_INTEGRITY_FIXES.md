# Financial integrity fixes

Invoice and receipt numbers now read `facility_key` only when the facility id belongs to the same organization as the tenant. A miss still uses the existing fallback `fac`. It does not read another organization’s key.

Posting an invoice still updates only `id` and `tenant_id`. If that update matches nothing, the service returns `not_found` and does not write the posted audit event.

The payment retry lookup is still `idempotency_key` plus `tenant_id`, then a rollback before insert. No payment was posted. Reversal remains off the cashier permission list. No price, refund amount, or retention period was chosen.
