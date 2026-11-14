# Improved assertions

`tests/v13/unit/d58-duplicate-guard.test.js` reads the payment function and requires `dupCheck.rows.length > 0`, the tenant predicate, `ROLLBACK`, and `DUPLICATE_SUBMISSION` before the payment insert. Re-applying M5 in the sandbox made that test fail. On the unmodified worktree it passes.

This detects the edited condition. It does not call `recordPayment` with an existing payment row, and it does not show a rolled-back insert. A behavioral duplicate test still needs an authorized cashier path that this stage did not invent.
