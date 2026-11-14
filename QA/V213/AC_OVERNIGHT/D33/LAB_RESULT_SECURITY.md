# Laboratory result security

`acknowledgeCriticalResult` returns `INVALID_INPUT` when the recipient name or the notification method is empty, and it does not open a database connection.

When both are present, the lookup is the newest active `critical_result` alert for the organization and healthcare organization. The SQL does not use the `resultId` argument. There is no escalation step. `LAB-01-03` stays partial until D21-06 is approved.

Unauthorized result edit was not executed. The diagnostics routes still depend on the existing permission keys. That is not a live denial.

A later isolated-database test, not run here, would need two results in one organization and would have to show which alert changed. Until the lookup uses the result id, that test must not be written as a pass.
