# Concurrency tests

Two in-memory overlap checks are not a stored race. The appointment service still checks the staff interval before a transaction and does not take a row lock. Capacity remains `BLOCKED_APPROVAL_REQUIRED`.

The payment retry test rolls back before a second insert. That is one fake connection, not two database sessions.

Persistent appointment concurrency is `NOT_VERIFIED`. A later run needs two connections against one stored appointment, and only after the capacity rule is approved. The browser queue and cashier screens stay behind `hold()` until the browser flag and a guarded `E2E_DATABASE_URL` are already set.
