# Appointment fixes

No appointment service change was approved.

Staff overlap still runs before `BEGIN` in `createAppointment`. A second request that is checked before the first row is stored does not see that row. The repository query stays organization-scoped and does not use `FOR UPDATE`.

Public booking retry is already schema-compatible. A unique-key conflict (`23505`) re-reads by organization and idempotency key. The recovered response has no access token. A conflict that is not that key is rethrown. The booking token is not revoked.

Slot capacity remains `BLOCKED_APPROVAL_REQUIRED` with a null capacity. No capacity number was added.
