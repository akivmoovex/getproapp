# Test coverage plan

The traceability file assigns every ID a test requirement and an evidence requirement. Counts from the validator: 84 IDs, 0 duplicates, 0 acceptance passes.

| Evidence | Plan |
|---|---|
| Unit or contract | 44 execution-only cases can extend current in-process tests. 35 design-required cases stay unspecified until the policy exists. 4 deferred cases stay unbuilt. SEC-01-02 stays an in-process denial, not a live pass |
| Database | `NOT_RUN` on all 84. A gated integration file is not a pass |
| Browser | `NOT_RUN` on all 84. A spec that calls `hold()` is not a pass |
| Authenticated security | Required for every `NEG/SEC` row and still not run. SEC-01-02 is `BLOCKED_NOT_RUN` |
| Operational recovery | Required for OPS-01 and OPS-02 only. Those six are `REQUIRED_NOT_RUN` |

Existing safe tests, which do not close a row:

- D22 G1 historical result: 195 passed, 0 failed.
- D28 rerun: 233 passed, 0 failed, 0 skipped. Integration and browser files were outside that command.
- D24 portal, D25 appointments, D26 OTP, and D27 clinical source contracts are in-process.

New files named in the packages are not created here. Creating them before the approval would either duplicate source inspection or assert behavior the product does not have.

Uncovered by any acceptance ID, so they need a case before they can be called tested:

1. Consent capture and withdrawal.
2. Representative and witness.
3. Structured allergy review before dispense.
4. Clinical accessibility.
5. Monitoring of authentication, OTP delivery, queue age, critical acknowledgement, backup, and import exceptions.
6. Availability SLOs, hosting location, and controller roles.
7. Outbox publication after commit.
8. Versioned clinical HTTP paths.

D22's 195 remains the historical G1 baseline. It is not evidence that later stages finished.
