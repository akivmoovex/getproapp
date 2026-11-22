# V13 G52 — hardening results

Reviewed the G47–G51 edits.

The handoff helper returns a URL only for a permission that the encounter loader has already confirmed. It does not skip the department route’s own gate. A missing grant produces no link, not a success page.

`openMigrationBatch` returns before `db.query` when authorization is missing or uses another permission key. The service is still unrouted, so the check cannot be bypassed by a form in this tree.

No clinical note overwrite, laboratory range, dispense remainder, billing reversal, OTP, CSRF, or appointment version check was relaxed. No attachment path was added. Migration 043 was not executed.

Negative coverage is the denied batch call and the empty handoff grant. Both passed inside the 475 safe tests.

```
HARDENING_FAILURES=0
CONTROLS_WEAKENED=NO
MIGRATION_043_EXECUTED=NO
```
