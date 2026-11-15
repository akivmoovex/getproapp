# Design approval register

No decision in this set has approval evidence. The D80 authorization covered a commit and push of the existing tree. It did not approve a clinical rule. The D84 trigger remains unapproved.

| ID | Decision | Evidence of approval | Allowed now |
|---|---|---|---|
| D21-01 | Clinical role matrix | None | Keep the current catalogue |
| D21-02 | Encounter states | None | Keep `open`, `completed`, `cancelled` |
| D21-03 | Merge, lineage, unmerge | None | Do not merge |
| D21-04 | Missing phone and national ID | None | Do not invent an identifier |
| D21-05 | Appointment capacity | None | Do not add a slot lock or a capacity number |
| D21-06 | Critical-result escalation | None | Keep the current alert. Do not add a timer |
| D21-07 | Pharmacy substitution | None | Do not treat columns as a rule |
| D21-08 | Billing reversal | None | Keep the current finance-supervisor permission |
| D21-09 | Retention and disposal | None | No deletion path |
| D21-10 | Backup, RPO, and RTO | None | No restore claim and no number |
| D21-11 | OTP provider | None | Do not activate delivery and do not add a migration |
| D21-12 | Break-glass | None | Do not build it |
| D21-13 | Juflona signing | None | Leave it absent |
| D21-14 | V2.12 portal sentence | None | Do not treat it as new evidence |
| D21-15 | What closes AC-05 | None | A live lower-privilege HTTP 403. A login redirect is not that denial |
| D29-16 | Representatives | None | Do not add a representative record |
| D29-17 | Allergy review before dispense | None | Free text is not a blocker |
| D29-18 | Accessibility, monitoring, and SLO numbers | None | Do not invent a number or a screen list |

Eighteen decisions remain pending. Proposed clinical rules stay proposed.
