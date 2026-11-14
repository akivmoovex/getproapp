# Clinical authorization tests

| Test | Result |
|---|---|
| Encounter with no staff member | `invalid_input` before a query |
| Facility not in the organization | `facility_not_found`, no insert |
| Second open encounter | `duplicate_active_encounter`, no insert |
| Opened encounter | The event stores the staff member |
| Pain below 0 or above 10 | `invalid_input` before a query |
| Triage row in another facility | `access_denied` |
| Stale triage version | `stale_version` |
| Consultation note in another facility | `consultation_not_found` |
| Note already signed | `cannot_edit_signed` |
| Close with a missed version | `stale_version`, no event |
| Second active queue entry | `duplicate_active_queue_entry` |
| Queue call for another facility | `access_denied` |
| Call on a completed entry | `invalid_status_transition` |
| Transfer of a waiting entry | Status becomes transferred and the event stores the staff member |

These use a fake database. They are not a stored-visit pass.
