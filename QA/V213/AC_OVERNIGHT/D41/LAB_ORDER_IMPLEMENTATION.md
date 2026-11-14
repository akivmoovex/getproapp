# Laboratory and order implementation

An order whose type is not `laboratory`, `prescription`, `radiology`, or `other` returns `invalid_input` before a query. Those four names are the stored check. Statuses remain `draft`, `submitted`, and `cancelled`.

A laboratory result is copied from the request’s patient. It is not accepted when the request is `cancelled`, `rejected`, `resulted`, `verified`, or `released`. The status update also requires the caller’s organization and one of `pending_collection`, `collected`, `received`, or `processing`.

The existing laboratory and radiology request lookup for a clinical order now includes `organization_id`. Releasing a radiology report updates only a row in the caller’s organization.

Critical acknowledgement now loads the laboratory result in the caller’s organization and acknowledges the newest active `critical_result` alert for that patient. A missing result, or no active alert for that patient, returns `RESULT_NOT_FOUND` and does not acknowledge another patient. The alert table still has no column that points at a laboratory result, so two active alerts for the same patient still resolve to the newest one. No escalation timer was added.
