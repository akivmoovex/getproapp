# Persistence and browser readiness

Neither gate was run.

Patient creation, activation, and identity linking still depend on the 13 existing integration files. Those files return before `openPool` while the write flags are `0`. No fourteenth integration file was added.

Registration and portal activation in the browser are the held tests in `tests/e2e/v13/v13-ac-platform-qa.spec.js`. Each calls `hold()` before a page action. They were not executed.

A stored patient row and a stored portal activation remain `NOT_RUN`.
