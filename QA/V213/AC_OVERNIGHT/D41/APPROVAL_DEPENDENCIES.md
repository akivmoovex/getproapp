# Approval dependencies

| Item | Why it is still blocked |
|---|---|
| D21-06 escalation | No timer, recipient route, or deadline is approved. The acknowledgement does not page anyone |
| Result link on an alert | `clinical_alerts` has no laboratory-result column. Adding one needs a migration that was not approved |
| D21-07 substitution | No substitution function and no new permission |
| D29-17 allergy review | Free text stays free text. No dose or drug block |
| D21-08 reversal home | Reversal stays off the cashier catalogue |
| Outbox | No table and no event name |

Acceptance rows for orders, laboratory, pharmacy, and billing stay not run. In-process checks are not those passes.
