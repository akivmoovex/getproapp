# Workflow state proposal

Proposed only. The stored states stay until an owner adopts a replacement.

| Workflow | Stored now | Proposed target, not implemented |
|---|---|---|
| Encounter | `open`, `completed`, `cancelled` | `REGISTERED`, `WAITING`, `IN_TRIAGE`, `IN_CONSULTATION`, `ACTIVE_ORDERS`, `READY_FOR_CLOSEOUT` |
| Queue | Active entry, duplicate rejected | The same visit states, with one active row |
| Notes | `draft`, `signed` | Signed note plus an amendment row. The table is unused |
| Orders | `draft`, `submitted`, `cancelled` | Department handoff that rolls back on failure |
| Results | Critical flag and an alert | Acknowledgement of that result, then an approved escalation |
| Pharmacy | Dispense columns, including substitution fields | A written substitution rule |
| Billing | Invoice, idempotent payment, supervisor reversal | No change until finance confirms the catalogue |
| Documents | Metadata | Scan digest, quarantine, legal hold, two-person disposal |

Invalid transitions for the proposed encounter list do not exist, because those states do not exist. The current completion path only updates an `open` row.

Recommendation: keep the stored states for the next implementation stage. Map the matrix names to them in the test plan, and do not rename the database until the clinical owner accepts the proposed list.
