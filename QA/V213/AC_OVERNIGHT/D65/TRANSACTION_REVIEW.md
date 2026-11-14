# Transaction review

| Path | Boundary | Result |
|---|---|---|
| Payment idempotency | Inside `BEGIN`, after the advisory lock, before `INSERT` | Same tenant and key returns `duplicate_submission` and `ROLLBACK`. Another tenant’s key continues toward insert |
| Patient not in the tenant | Before `connect` | `not_found`. No transaction |
| Public booking retry | Single statement, then a scoped re-read | Duplicate response, no second token |
| Staff overlap | Before the appointment transaction | Two checks can both pass. This is not persistent protection |

The payment rules were not changed. The new test calls `recordPayment` and reaches the existing duplicate return. Inverting `rows.length > 0` would let the same-tenant case continue to `INSERT`.
