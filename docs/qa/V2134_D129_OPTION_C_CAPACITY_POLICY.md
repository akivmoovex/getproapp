# V2.13.4 D129 — D25 Option C capacity policy

**OPTION_C_APPROVED=YES**

For ActiveClinic V2.13.4, assigned-staff non-overlap is the complete
appointment-capacity rule:

- One staff member may not have two overlapping active appointments.
- Different staff members may have simultaneous appointments.
- `appointment_collision` remains the conflict response.
- Adjacent intervals are allowed.
- `cancelled`, `no_show`, and `completed` appointments do not block.
- No separate capacity integer is introduced.

This decision does not add capacity by room, service, facility, group,
unassigned appointment, or public-booking slot. Walk-in queue capacity remains
a separate service-point rule. Public booking remains disabled unless separately
enabled.

The existing transaction-scoped staff advisory lock and same-transaction
collision query remain the enforcement mechanism. Tenant and healthcare-
organization scoping, facility authorization, optimistic versions, rollback,
rescheduling, cancellation, and reassignment behavior remain unchanged.

## Gate interpretation

The former D25 slot-capacity failure represented an unapproved product policy,
not a defect in the assigned-staff overlap guard. D129 updates the acceptance
contract to Option C. It does not claim a new PostgreSQL run.

Historical evidence remains unchanged:

- D119/G2: 10 executed, 9 passed, 1 failed.
- Prior disposable PostgreSQL staff-overlap evidence remains historical evidence.
- D129 performs no database or browser execution.

`D25_UNIT_CONTRACT=PASS` is a safe local result after the policy update.
`D25_POSTGRESQL_INTEGRATION=NOT_RERUN` remains the correct D129 status.
