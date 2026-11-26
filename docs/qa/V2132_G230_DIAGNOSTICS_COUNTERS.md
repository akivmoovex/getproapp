# G230 diagnostics counters

Laboratory and radiology dashboard counters are loaded from independent
`GROUP BY status` queries on the facility-scoped request tables. Queue tabs
use the same counts.

Laboratory open queue excludes `resulted` and `verified`. Radiology open
queue excludes `reported` and `verified`. Reported radiology has its own tab
and `data-ac-rad-count="reported"` metric. Verified radiology is counted
separately from completed and reported.

HTTP and browser journeys assert the request number appears under the correct
filter and that dashboard counters move with the stored status.
