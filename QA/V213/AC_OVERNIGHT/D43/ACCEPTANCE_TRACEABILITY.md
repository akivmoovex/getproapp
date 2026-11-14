# Acceptance traceability

The 84 IDs in `QA/V213/AC_OVERNIGHT/D36/ACCEPTANCE_84_FINAL.csv` are unchanged: 0 passed, 83 not run, and `SEC-01-02` blocked. The eight supplementary rows `ACX-001` through `ACX-008` are not run and are not part of the 84.

D38–D42 added in-process checks only. None of those checks is an acceptance pass.

| IDs touched in process | What the code now does | Acceptance |
|---|---|---|
| Portal and tenant rows in package A | Guest registration is bound to the clinic organization and a second owner is refused | Not run |
| `SEC-01-02` | Route guards remain. No live lower-privilege session was used | Blocked |
| `APT-01-03` | A bad staff id is rejected. Capacity and the overlap race stay unapproved | Not run |
| Encounter, queue, and triage rows | Organization predicates and the stored 0–10 pain check | Not run |
| Order, laboratory, pharmacy, and billing rows | Patient-scoped acknowledgement, tenant-scoped payment retry, organization-scoped stock lock | Not run |
| Document rows | Organization joins and a matching caller patient | Not run |

AC-05 live denial was not run. No database-backed row was executed.
