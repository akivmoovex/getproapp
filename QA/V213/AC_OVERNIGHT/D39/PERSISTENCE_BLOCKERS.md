# Persistence blockers

| Blocker | State |
|---|---|
| D21-05 capacity | `BLOCKED_APPROVAL_REQUIRED`. No number, column, or migration was chosen |
| Staff-overlap race | The check stays outside the transaction. A lock would be a transactional change and was not made |
| Stored conflict | `NOT_RUN`. No database was opened for a pass |
| Simultaneous booking | The existing `APT-01-03` gated test still returns `NOT_RUN` |
| Browser conflict | Prepared only. Not executed |
| Public booking | Left independent of portal activation and of slot capacity |

`APT-01-03` stays missing. Appointment conflict persistence stays not run.
