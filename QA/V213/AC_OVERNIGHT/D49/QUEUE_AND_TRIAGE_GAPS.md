# Queue and triage gaps

Queue number allocation still locks a service point only in the caller’s organization. A second active entry at the same service point is still refused. No handoff between departments was added. That needs a named owner for each step, and D21-02 does not provide one.

Triage still rejects a pain value outside the stored integers 0 through 10, and a category or status outside the stored lists, before a query. No blood-pressure cutoff or other diagnostic threshold was added. A vital sign is still inserted as its own row, with the staff id and the time, and is not updated in place.

A later disposable test, not run here, should open one encounter, refuse a second open encounter for that patient at that facility, close it once, and show that a second close with the same version changes nothing.
