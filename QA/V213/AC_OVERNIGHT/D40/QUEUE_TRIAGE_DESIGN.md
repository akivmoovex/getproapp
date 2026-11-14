# Queue and triage design

## Queue

A patient already in `waiting`, `called`, `serving`, or `paused` at the same service point still gets `duplicate_active_queue_entry`. The number allocation now fails closed when the service point is not in the caller's organization.

A handoff service that moves a patient between departments is not implemented. It would need a named owner for each step. That name is not in an approved decision. Existing updates stay on `updateQueueEntryByOrgAndId`, which already requires organization and healthcare organization.

## Triage

Stored categories are `emergency`, `urgent`, `semi_urgent`, and `non_urgent`. Stored statuses are `draft` and `completed`. Stored pain is null or an integer from 0 through 10. A value outside those checks returns `invalid_input` before a query.

No blood-pressure cutoff, score, or other clinical threshold was added. Allergy text remains free text. It is not a dispense block.
