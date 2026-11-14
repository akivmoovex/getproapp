# Design approval register

All items remain unapproved. A recommended default is not an approval.

| ID | Decision | Default while unapproved |
|---|---|---|
| D21-01 | Clinical role matrix | Keep the current catalogue |
| D21-02 | Encounter states | Keep `open`, `completed`, `cancelled` |
| D21-03 | Merge, lineage, unmerge | Leave merge assigned to nobody |
| D21-04 | Missing phone and national ID | Do not invent an identifier |
| D21-05 | Appointment capacity | Do not claim a slot lock |
| D21-06 | Critical-result escalation | Keep the alert. Do not add a timer |
| D21-07 | Pharmacy substitution | Do not treat the columns as a rule |
| D21-08 | Billing reversal and where payments live | Reversal stays with finance supervisor |
| D21-09 | Retention and disposal | No deletion path |
| D21-10 | Hosting, backup, RPO/RTO | No restore claim |
| D21-11 | OTP provider and migration | Activation stays blocked |
| D21-12 | Break-glass | Do not build it |
| D21-13 | Juflona signing | Leave it absent |
| D21-14 | Reuse of the V2.12 portal pass | Do not treat the old sentence as evidence |
| D21-15 | What closes AC-05 | Live lower-privilege denial. The cashier referral is a different case |
| D29-16 | Consent representative, witness, and disclosure | Use the existing consent ledger only for its current types |
| D29-17 | Allergy review before dispense | Free-text triage allergies are not a blocking check |
| D29-18 | Accessibility, monitoring, and SLO numbers | No release claim from their absence |

The specification also says exact HTTP paths and table names are not approved. This stage does not draft them.
