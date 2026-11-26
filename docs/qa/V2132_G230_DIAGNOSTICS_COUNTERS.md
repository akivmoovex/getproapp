# G230 diagnostics counters

Laboratory and radiology counters are now derived from persisted status
aggregates scoped by facility, organisation and healthcare organisation.
Laboratory tabs distinguish pending collection, collected, received,
processing, resulted, verified and all. Radiology distinguishes pending,
in-progress, completed, verified and all.

G224 executes received-count, processing-exclusion, and laboratory result
status assertions against PostgreSQL. Unit tests cover zero, one and multiple
counts and the open-count arithmetic. A broader multi-facility/date-filter
matrix and a full radiology persisted journey remain P1 coverage work.
Counters are not written by fixtures and are not inflated to make assertions
green.
