# Development dependencies

The backlog is ready as a plan. It is not authorization to implement.

Order:

1. Security gate. AC-05 live denial stays first. Do not widen a role to produce it.
2. Encounter decision. Keep `open | completed | cancelled` unless the owner adopts the proposed list. Queue and nursing depend on that choice.
3. Note amendment. Wire `consultation_note_amendments` only after the owner confirms the reason and author fields. Do not allow in-place edits of signed notes.
4. Order handoff. Add a failure path that does not leave a submitted order without a result only after the encounter states are settled.
5. Critical results. Change acknowledgement so it targets the result id, then add escalation only after the laboratory owner approves the policy.
6. Pharmacy substitution. Leave the columns unused as policy until the pharmacy owner chooses a rule.
7. Billing. Keep reversal on the finance supervisor. Do not give it to the cashier.
8. Documents and retention. No scan import, quarantine, or disposal until legal periods are confirmed.
9. Merge. Leave `activeclinic.patient.merge` unassigned until a merge and unmerge design is approved.

Each later item depends on the decision in front of it. Schema changes are not included in this stage.

Approvals still required:

1. Clinical role matrix.
2. Encounter and queue states.
3. Note amendment rules.
4. Critical-result acknowledgement and escalation.
5. Pharmacy substitution.
6. Billing reversal boundary.
7. Document retention and disposal.
8. Patient merge.
9. Break-glass, which stays deferred.
10. AC-05 closure definition.
