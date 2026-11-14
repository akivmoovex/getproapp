# Billing transaction review

Package E in the D29 file has 3 IDs, not 9: `FIN-01-01`, `FIN-01-02`, and `FIN-01-03`.

`recordPayment` takes an idempotency key. Inside the transaction it locks `ac-pay-idem:<key>`, selects `payments` by that key, and on a hit runs `ROLLBACK` and returns `duplicate_submission` before `INSERT INTO activeclinic.payments`. That is the retry control in source. It was not executed against a database, and it does not by itself prove two workers.

`activeclinic.payment.reverse` remains on the finance supervisor catalogue and not on the cashier list. The unauthorized reversal was not executed.

No payment, invoice, or receipt was posted. No price or reimbursement rule was added. `FIN-01-01` stays not executed.
