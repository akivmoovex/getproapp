# Approval boundary

Explicit approvals found: none. D21-01 through D21-15 and D29-16 through D29-18 are all `PENDING` in `QA/V213/AC_OVERNIGHT/D30/DESIGN_DECISION_REGISTER.md`. D36 repeated that register and did not approve any row.

## Already enforced, so a local bug fix is allowed

These are current code contracts, not newly approved designs. A fix must keep the contract and add a failing test first. This stage found no new defect that required a code change.

| Contract | Current rule |
|---|---|
| AC-05 route | `requireApex` and `requirePlatformAdmin` on `/admin` and the test-database routes |
| Portal registration | CSRF is checked. Registration does not issue a session |
| Appointment overlap | Staff collision is checked only when a staff id is present, and it is check-then-insert |
| Duplicate identity | `BLOCK`, `WARN`, `WARN_REVIEW`, or `ALLOW`. No merge action |
| Encounters | `open`, `completed`, `cancelled` |
| Signed notes | `cannot_edit_signed`. No amendment insert |
| Orders | `draft`, `submitted`, `cancelled` |
| Critical acknowledgement | Newest active alert. Empty recipient stops before a connection |
| Dispense | Empty item list stops before a connection. Permission key is `activeclinic.pharmacy.dispense` |
| Payments | Repeated idempotency key rolls back before insert. Reversal stays off the cashier list |
| Consent | Forged organization id returns `forged_tenant` before a query |
| OTP | `1234` only for the verified testing identity. Production activation stays blocked |
| CSRF | Token must match the cookie and the session secret |
| Offline page | HTTP 503 and no insert |
| BlessBoard | No source query of `activeclinic.patients` |

## Proposed only, so implementation is not allowed

Encounter rename, merge and unmerge, a missing-identifier rule, slot capacity, critical escalation, substitution, allergy blocking, moving payments, retention periods, disposal, restore, RPO/RTO, offline writes, monitors, SLO numbers, break-glass, Juflona signing, representative identity, scan quarantine, and a versioned clinical API. The eight `ACX` rows are in this group.

Live AC-05 denial, portal persistence, and appointment persistence are evidence gaps. They are not permission to change the product so that a test can pass.
