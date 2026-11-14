# Encounter implementation

An encounter now opens only when the facility and the patient belong to the caller’s organization. A second open encounter for the same patient and facility is still rejected. The staff member who opens it is stored on the encounter and on the opened event.

Close still requires the stored version. A miss returns `stale_version` and does not write an event. The stored statuses remain open, completed, and cancelled. No new status was added.
