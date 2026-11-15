# Feature dependencies

Evidence of current behavior can be collected for package A, then B, then C through F. Packages G and H do not start. No step adds a schema or a provider.

| Order | Work | Depends on | Stop rule |
|---|---|---|---|
| 1 | Tenant, facility, and department scope already in the services | Current tables | Do not add a department type or a wing |
| 2 | Patient registration, duplicate filtering, and portal reset scope | The same organization boundary | Do not merge. Do not change the registration sentences. Do not revoke the booking token |
| 3 | Encounter, queue, and triage checks | Stored statuses only | Do not add a state or a vital threshold |
| 4 | Signed notes, result-to-patient checks, dispense checks | The current permissions | Do not add an amendment, an allergy blocker, or a substitution rule |
| 5 | Payment retry and reversal inside the current tenant and facility | The current finance permission | Do not add a reversal right |
| 6 | Document facility match and the empty-attachment rejection | The current document row | Do not add quarantine or a hash column |
| 7 | Consent withdrawal bound to the row's patient | The six current consent types | Do not add a representative or a retention period |

Appointment overlap stays an in-memory check until two database sessions are authorized. Capacity stays blocked by D21-05, so no lock is part of this order. OTP delivery, backup, offline writes, monitoring, a versioned clinical route, and Juflona signing stay after the pending decisions. BlessBoard isolation tests stay on the current shared session and role code and do not import church screens into ActiveClinic.
