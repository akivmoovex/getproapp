# Approval boundary

Eighteen decisions remain pending: D21-01 through D21-15, D29-16, D29-17, and D29-18. This stage approves none of them.

Of the 84 cases, 44 are `EXECUTION_ONLY`, 35 are `DESIGN_REQUIRED`, 4 are `DEFERRED`, and 1 is `BLOCKED` (`SEC-01-02`). Execution-only means the current code may be evidenced. It does not authorize a new rule.

Sixteen feature areas stay blocked for any further product change:

| Area | Decision |
|---|---|
| Role grants and what closes AC-05 | D21-01, D21-15 |
| Merge and lineage | D21-03 |
| Representatives | D29-16 |
| Encounter state names | D21-02 |
| Consultation amendments | No approved reason and author fields |
| Critical-result target | D21-06 |
| Substitution and allergy review | D21-07, D29-17 |
| Billing reversal | D21-08 |
| Quarantine and retention | D21-09 |
| Slot capacity | D21-05 |
| OTP provider and migration | D21-11 |
| Break-glass | D21-12 |
| Backup, RPO, and RTO | D21-10 |
| Offline writes | No approved writer |
| Accessibility, monitoring, and SLOs | D29-18 |
| Juflona signing | D21-13 |

No migration is authorized for those areas. `048_otp_challenges.sql` must not be created.
