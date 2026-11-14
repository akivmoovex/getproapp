# Billing integrity

A repeated payment idempotency key is now compared inside the same `tenant_id`. The lookup still rolls back and returns `duplicate_submission` before insert. A key that belongs to another tenant does not count as this tenant’s retry.

Reversal remains on the finance-supervisor catalogue. The cashier role was not given `activeclinic.payment.reverse`. No payment, receipt, or reversal was posted.
