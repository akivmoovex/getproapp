# V13 G23 — security and integrity

No security check was relaxed. No source file was edited in this phase.

| Area | What the current source does |
| --- | --- |
| Passwords and OTP | Audit metadata drops password and OTP keys. Production refuses the BlessBoard test OTP provider. |
| CSRF | Foundation server still rejects a missing token. Theme rendering reuses one token. |
| Tenant and facility | Encounter close, laboratory lookup, and pharmacy catalogue lookup include the organization. BlessBoard is still not allowed to read `activeclinic.patients`. |
| Clinical notes | Signed consultation notes return `cannot_edit_signed`. The amendments insert remains absent, which the existing contract requires. |
| Patient link | A laboratory result uses the request’s patient. Two strong identity matches are not merged. |
| Money | Amounts stay in integer minor units. `duplicate_submission` and `already_reversed` remain. No payment provider was added. |
| Concurrency | A second open encounter and a second active queue row are rejected. Appointment updates still return `stale_version`. A repeated clinical POST can still create a second order because no idempotency key exists, and none was invented. |
| Records route | `openMigrationBatch` is not imported by an HTTP file. It must not be mounted without a permission check. |

```
SECURITY_STATUS=IMPLEMENTED_E2E_NOT_RUN
```
