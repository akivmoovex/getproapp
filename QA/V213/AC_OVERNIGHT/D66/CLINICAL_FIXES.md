# Clinical fixes

These writes already loaded the caller’s organization, then updated by id. The update now repeats that organization, and a miss rolls the transaction back.

| Write | Added predicate | Miss |
|---|---|---|
| Radiology request marked reported | Organization, healthcare organization, and facility | `REQUEST_NOT_FOUND` |
| Laboratory result verify | Organization, healthcare organization, and the existing closed statuses | `INVALID_STATUS` |
| Radiology report verify | Organization, healthcare organization, and the existing closed statuses | `INVALID_STATUS` |
| Radiology release | Healthcare organization, and `verified` on the report | `INVALID_STATUS` or `REQUEST_NOT_FOUND` |
| Dispense item, batch, and prescription | Organization and healthcare organization | Item or prescription not found |
| Medication catalogue lookup | Organization beside the healthcare organization | Existing not-found result |

`isClosedDiagnosticStatus` names the two statuses the verify functions already rejected: `verified` and `released`. A closed result and the entering staff member still fail before the update.

No dose, allergy block, substitution, merge, retention period, or payment rule was added. Acknowledgement still has no result id and no escalation timer.
