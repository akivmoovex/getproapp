# Queue implementation

A second active entry for the same patient and service point is still rejected. A status change now refuses a facility id that is not the entry’s facility, and the update includes that facility.

Waiting can still move to called, cancelled, left before service, or transferred. A completed entry cannot be called. A transfer records the acting staff member. No new queue status was added.
