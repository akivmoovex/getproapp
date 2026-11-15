# Concurrency test results

No competing database sessions ran.

`d25-appointment-concurrency.integration.test.js` still expects `NOT_RUN` while the gate is closed. If the gate were opened without a capacity approval, it throws `APT-01-03_NOT_IMPLEMENTED` and `BLOCKED_APPROVAL_REQUIRED`. That file was not executed.

Two in-memory overlap checks are not concurrency evidence. Slot capacity stays unapproved, so no lock was added and no capacity assertion passed.
