# V13 G67 pharmacy completion

Manual prescribing stays manual. The form still says no drug-interaction checking and no auto-prescribe. No catalogue picker was added and no dose was suggested.

`prescriptionQueueQuery` returns `&pharmacy_queue=waiting_for_catalogue` when a prescription fulfillment was not created. The encounter flash then says the prescription was saved and is not on the pharmacy queue until a catalogue item id from this organisation is entered. A created queue handoff does not add that query. The form tells the clinician that a blank catalogue id saves the order without placing it on the queue.

Dispense behavior is unchanged: positive whole quantities, remaining-quantity checks, one-request duplicate rejection, and no delete of a dispense event. Cross-request idempotency was not added because there is no idempotency column.

The safe unit test covers the queue query for a skipped prescription, a queued prescription, and a non-prescription request. The Playwright case `G67 prescription editor explains the pharmacy queue` calls `hold()` first and needs `E2E_AC_ENCOUNTER_ID` when it is eventually authorized. It was not executed.

Status: `PARTIAL`. Queue eligibility remains explicit and unassigned.
