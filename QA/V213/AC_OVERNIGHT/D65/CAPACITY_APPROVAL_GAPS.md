# Capacity approval gaps

`evaluateSlotCapacity` still returns `BLOCKED_APPROVAL_REQUIRED` and `capacity: null`. D21-05 is unapproved, so no limit, lock, or migration was added.

The prepared checks are:

| Check | Status | Dependency |
|---|---|---|
| Two connections, one stored appointment | `NOT_RUN` | A disposable database, and a decision before any new lock |
| Slot capacity | `NOT_RUN` | D21-05 must name the rule before a column or predicate exists |

No migration file was created. Payment idempotency and booking unique-key recovery use columns that are already in the service SQL.
