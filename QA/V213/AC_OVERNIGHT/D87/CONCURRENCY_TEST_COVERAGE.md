# Concurrency test coverage

G2 was not run. The existing appointment integration file still throws `APT-01-03_NOT_IMPLEMENTED` and `BLOCKED_APPROVAL_REQUIRED` if its gate opens, and both of its tests expect `NOT_RUN` while the write flags are `0`.

No new integration file was added. The in-memory overlap checks in `d87-visits-appointments.test.js` are not two database sessions. Browser appointment coverage remains the held test in `tests/e2e/v13/v13-ac-platform-qa.spec.js`. It was not executed.
