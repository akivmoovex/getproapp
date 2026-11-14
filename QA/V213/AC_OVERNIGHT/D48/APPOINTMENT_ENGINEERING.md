# Appointment engineering

Assigned-staff overlap is unchanged. It still runs only when a staff id is present, still uses the existing interval predicate, and still runs before `BEGIN`. The appointment service still has no `FOR UPDATE` and no `slot_capacity`. A non-UUID staff id is still rejected before a query. A blank staff id is still unassigned. Cancellation still goes through the existing status transition and the organization-scoped version update. A stale version still returns `stale_version`.

The change is the public booking retry. Consultation and procedure inserts already look up `(organization_id, idempotency_key)` and the table already has that unique constraint. If two requests pass the lookup and the second insert raises `23505`, the service now reads that same key again and returns the stored request with `duplicate: true` and no new access token. If the unique violation is not that key, the error is thrown again. This is not a slot lock.

`evaluateSlotCapacity` still returns `BLOCKED_APPROVAL_REQUIRED` and null, and create still does not call it.
