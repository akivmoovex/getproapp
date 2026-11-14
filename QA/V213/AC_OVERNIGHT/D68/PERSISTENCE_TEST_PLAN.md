# Persistence test plan

None of these checks was run. Each one waits on a run-owned database that already passed the G2 gates.

| Check | Prepared assertion | Blocker |
|---|---|---|
| Patient activation | One portal identity for clinic A. A second owner of the same booking is `link_conflict`. The booking access token stays reusable | Fixture apply is held. The provisioner does not use the plan clinic key |
| Staff overlap | `runAcAuth` stores one appointment and expects `appointment_collision` on the same staff and slot | Sequential calls. Not two connections |
| Capacity | `evaluateSlotCapacity` returns `BLOCKED_APPROVAL_REQUIRED` and `capacity: null`. The gated test throws `APT-01-03_NOT_IMPLEMENTED` if the gate opens | D21-05 |
| Cross-tenant clinical read | Another organization does not receive `body_text` | Needs one stored document |
| Document event | The event insert selects the document in the caller organization | Same stored row |
| Payment duplicate | Same tenant and idempotency key rolls back with `duplicate_submission` | The unit test does not store a payment |
| Dispense and radiology updates | The update includes the caller organization. A miss rolls back | Needs stored rows |

Do not add `FOR UPDATE` or `slot_capacity` while D21-05 is open. Do not treat an in-memory duplicate as a stored row.
