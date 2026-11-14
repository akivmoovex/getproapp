# Design decision register

All 18 decisions from D30 remain pending. None was approved overnight.

| ID | Decision | Status |
|---|---|---|
| D21-01 | Clinical role matrix | PENDING |
| D21-02 | Encounter states | PENDING |
| D21-03 | Merge, lineage, unmerge | PENDING |
| D21-04 | Missing phone and national ID | PENDING |
| D21-05 | Appointment capacity | PENDING |
| D21-06 | Critical-result escalation | PENDING |
| D21-07 | Pharmacy substitution | PENDING |
| D21-08 | Billing reversal and payment home | PENDING |
| D21-09 | Retention and disposal | PENDING |
| D21-10 | Hosting, backup, RPO/RTO | PENDING |
| D21-11 | OTP provider and migration | PENDING |
| D21-12 | Break-glass | PENDING, deferred |
| D21-13 | Juflona signing | PENDING, deferred |
| D21-14 | V2.12 portal pass reuse | PENDING |
| D21-15 | What closes AC-05 | PENDING |
| D29-16 | Consent representative and disclosure | PENDING |
| D29-17 | Allergy review before dispense | PENDING |
| D29-18 | Accessibility, monitoring, and SLO numbers | PENDING |

The recommended option for each one is the current behavior: keep the stored encounter states, leave merge unassigned, do not add a slot lock, do not add an escalation timer, do not treat substitution columns as a rule, keep reversal on the finance supervisor, add no deletion path, make no restore claim, and keep OTP activation blocked. Recording that option is not an approval.
