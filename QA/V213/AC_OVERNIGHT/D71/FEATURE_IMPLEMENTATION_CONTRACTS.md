# Feature implementation contracts

HEAD is `b8f6b420d25e908de64ba292866c218c32edc30c`. No design decision was approved. No package is cleared to add behavior.

| Package | IDs | Contract |
|---|---|---|
| A | 23 | Keep the current portal, appointment, and OTP checks. Evidence only. No capacity lock and no production OTP |
| B | 9 | Keep organization scope. Do not add merge or a guessed identifier |
| C | 12 | Keep stored encounter states, queue rejection, and signed-note protection |
| D | 9 | Keep the current laboratory and pharmacy writes. No allergy block and no substitution |
| E | 3 | Keep tenant-scoped payment idempotency. No new reversal right |
| F | 6 | Keep the current consent allow-list. No representative record |
| G | 18 | No retention period, restore, offline writer, monitor, or service-level number |
| H | 4 | Break-glass and Juflona stay off |

Completion for every ID is stored behavior on a run-owned database, or an explicit decision that the behavior must not be built. A source contract, a fake database, or a Stage A run of 14 cases does not complete an ID.

The dependency order is evidence for package A, then B, then C through F, then G and H only after their decisions. G and H do not start now.
