# Encounter and queue implementation

Stored encounter statuses remain `open`, `completed`, and `cancelled`. `admitted` is not a stored status. D21-02 is still pending, so no new transition was added.

Encounter create still requires the facility and the patient to belong to the caller organization. Queue updates still pass the loaded entry's facility. A stale close still returns `stale_version` and writes no event. Those checks are the D73 tests. No handoff state was added.
