# Complete feature status

The 24 areas from D29 are unchanged by D30–D35. No area is fully implemented.

| Status | Count | Areas |
|---|---|---|
| Implemented | 0 | None. In-process tests are not completion |
| Partial | 17 | Facilities, roles, registration, consent ledger, encounters, nursing, notes, orders, critical alerts, pharmacy, billing, document metadata, portal, appointments, OTP and sessions, BlessBoard reuse, audit |
| Missing | 5 | Merge and unmerge, retention and disposal, backup and restore, offline recovery, accessibility and monitoring |
| Deferred | 2 | Break-glass, Juflona signing |

Package membership from the D29 file, summing to 84:

| Package | IDs |
|---|---|
| A Security and existing features | 23 |
| B Identity and facilities | 9 |
| C Encounters, nursing, notes | 12 |
| D Orders, laboratory, pharmacy | 9 |
| E Billing | 3 |
| F Documents and retention | 6 |
| G Operations and shared reuse | 18 |
| H Deferred | 4 |

Stored behavior that the new tests lock, without closing an acceptance row: self-escalation denied, forged consent tenant denied, signed notes not edited, orders limited to `draft | submitted | cancelled`, critical acknowledgement uses the newest alert, empty dispense stops early, a repeated payment key rolls back before insert, and the offline route does not write.
