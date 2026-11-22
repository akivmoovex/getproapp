# V13 G34 — security and integrity

No authorization check was removed. No source file was edited in G27–G35.

Reviewed and still present:

- Encounter close filters organisation, facility, and open status.
- Laboratory and pharmacy lookups filter organisation.
- Signed notes cannot be overwritten.
- Patient merge stays deferred.
- Appointment updates still return `stale_version`.
- Billing still has `duplicate_submission` and `already_reversed`.
- Audit metadata still drops password and OTP keys.
- Production OTP still refuses the test provider.
- Public booking stays off in the V13 fixtures.
- Migration 043 has no `DELETE`, `DROP`, or `TRUNCATE`.
- The import service is not imported by an HTTP route.

A repeated clinical order can still create a second order. No idempotency key was invented.

Database-free contract and unit tests on this unchanged HEAD:

```
tests 467
pass 467
fail 0
skipped 0
```

HTTP and Playwright were not run.
