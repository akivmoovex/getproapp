# Clinical architecture review

Branch `V13` at `b8f6b420d25e908de64ba292866c218c32edc30c`. No product file was edited. None of the 84 acceptance rows is a pass.

The clinical core in this review is 45 matrix rows: facility and identity, visits, nursing, notes, orders, laboratory, pharmacy, billing, documents, retention, and security. D21 classified them as 11 present and not executed, 23 partial, 10 missing, and 1 blocked. Patient portal and appointment rows stay in the D24 and D25 reports.

What the current code stores:

- Encounters are `open`, `completed`, or `cancelled`.
- Consultation notes are `draft` or `signed`. A signed note returns `cannot_edit_signed`.
- `consultation_note_amendments` exists. No clinical service inserts into it.
- Queue creation returns `duplicate_active_queue_entry` for a second active entry.
- Orders are `draft`, `submitted`, or `cancelled`.
- Critical results can set `is_critical` and `acknowledgeCriticalResult` marks the latest active `critical_result` alert. The lookup does not use the result id, and there is no escalation policy.
- Payment reversal is in the finance-supervisor catalogue and not in the cashier list.
- `activeclinic.patient.merge` is deleted from every ActiveClinic role.
- Clinical document code has no quarantine, legal hold, or retention expiry.

Facility and patient queries carry `organization_id`. That is the isolation boundary in source. It was not executed as a live cross-tenant denial.
