# G2 and G3 readiness

Thirteen integration files are prepared. Each one calls `runGated` and was not executed. A pass of that hold is not a stored-row result. Concurrency, rollback, and portal persistence stay unread.

Seven Playwright tests are prepared. Each calls `hold()` before a page action. They were not launched. AC-05 still has no authenticated HTTP 403.

Both write flags and the browser flag are `0`. No database URL is set. No integration or browser command was run.
