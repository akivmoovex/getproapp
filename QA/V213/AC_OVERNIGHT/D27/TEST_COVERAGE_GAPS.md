# Test coverage gaps

The safe suite started `2026-11-14T23:34:12+0200` and finished `2026-11-14T23:34:15+0200`. Exit 0. It passed 223 tests and failed 0. The new file is `tests/v13/contract/d27-clinical-foundation-contract.test.js`, with 6 contract checks. They read source and migrations. They do not open a database.

Those 6 checks confirm the stored encounter states, the signed-note refusal, the duplicate queue code, the unassigned merge permission, the finance-only reversal key, and the absence of scan quarantine. They do not pass any acceptance row.

| Case group | Tests that exist | Still missing |
|---|---|---|
| Encounter and queue | Source contract only | Live transition, duplicate retry, cross-facility denial |
| Notes | Source contract for `cannot_edit_signed` | Amendment insert, signed-note HTTP denial |
| Laboratory | Source contract that acknowledgement has no escalation | Result-specific acknowledgement and a critical-result policy test |
| Pharmacy and billing | Catalogue contract for reversal | Dispense, substitution, and unauthorized reversal HTTP |
| Documents and retention | Source contract that the words are absent | There is no behavior to test until a rule is approved |
| Security | AC-05 remains blocked from D22 | Live lower-privilege denial |

Do not add tests that expect `REGISTERED` or a retention deletion. Those behaviors are not implemented.
