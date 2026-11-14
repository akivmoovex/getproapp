# Proposed decision options

Every recommended option below is the default already recorded in D21 or D29. Recording it again does not approve it.

| ID | Recommended option while pending | Why this option | Alternatives | If the alternative is chosen later |
|---|---|---|---|---|
| D21-01 | Keep the twelve-role catalogue | Nothing in D29 marks a row wrong. AC-05 must not be forced by a new church role | Revise keys, or add facility-scoped roles | Package B denials and finance reversal need to be re-tested |
| D21-02 | Keep the three stored encounter states | Queue, triage, and notes already use them | Adopt the eight proposed names, or map names without a migration | Package C and D wait. Version checks have to move with the states |
| D21-03 | Leave merge unassigned | There is no lineage or unmerge writer | Approve merge plus unmerge, or match-only with no merge | Registration can stay. Clinical reparenting cannot start first |
| D21-04 | Do not invent an identifier | Phone and national ID can both be absent, and no rule was found | Require one strong identifier, allow a visible staff attestation, or block the portal | Portal tests in package A change. Production OTP stays blocked either way |
| D21-05 | Keep staff-overlap checks and do not add a lock | Capacity is unspecified. Two requests can both pass today | One booking per staff slot with a lock, or a facility capacity separate from staff | `APT-01-03` stays missing until the number and the lock exist together |
| D21-06 | Keep the critical alert and add no timer | Acknowledgement selects the newest alert, not the result id | Required acknowledgement, or timed escalation | Laboratory and clinical owners approve the path before package D changes it |
| D21-07 | Do not treat substitution columns as a rule | No written substitution policy was found | Disallow substitution, pharmacist reason, or prescriber approval | Dispense provenance has to keep the original item |
| D21-08 | Keep billing in ActiveClinic and reversal on the finance supervisor | That is the current catalogue | Move payment primitives to the platform | Shared Platform becomes a joint owner. Cashier permissions stay unchanged |
| D21-09 | Add no deletion path | Zambia periods are not confirmed | Defer, approve categories after legal advice, or hold-only | Package F may add a hold only after that advice. Expiry still must not delete |
| D21-10 | Make no restore claim and add no cross-tenant restore | The repository has no drill, RPO, or RTO | Document the host without a drill, or require a disposable drill before a release claim | Package G stays blocked for `OPS-01` until the drill exists |
| D21-11 | Keep OTP activation blocked and create no migration | Providers are unselected. The store is process memory | Approve a provider and migration later, or limit OTP to sensitive actions | Login behavior stays as it is until that choice. `1234` stays testing-only |
| D21-12 | Do not build break-glass | It would be a bypass | Build a reason, time limit, and review | Package H only. It cannot close AC-05 |
| D21-13 | Leave Juflona signing absent | The repo has demo content, not a signing flag | A default-off flag with no flow, or signing after discovery | Package H. Default remains off for every other tenant |
| D21-14 | Do not reuse the V2.12 portal sentence | The cited output directory is absent | Recover the artifact, or re-run on a disposable database | `PAT-01-01` stays not run until one of those produces the row |
| D21-15 | Require a live lower-privilege denial of the admin operation | The cashier referral is a different case | Name the principal and the route, or accept the cashier case | Accepting the cashier case would change the gate. This option refuses that |
| D29-16 | Use the current consent ledger only | Types, statuses, and withdrawal already exist. Representative disclosure does not | Add representative and witness fields after a privacy owner defines them | `ACX-001` can characterize current code. `ACX-002` waits |
| D29-17 | Do not add an allergy blocker | Triage text is the only allergy store found | A review record with no dose rule, after the pharmacy owner writes it | No drug, dose, or interaction threshold is proposed |
| D29-18 | Make no SLO or accessibility release claim | No number or screen list is in D29 | Approve a screen list, a monitor list, and numeric targets separately | Monitors must not contain OTP material or clinical text |

Operational consequence of leaving all 18 pending: V2.13 can collect evidence for behavior that already exists. It cannot take the proposed encounter list, merge, capacity, escalation, substitution, retention, restore, OTP activation, break-glass, or Juflona into the release.
