# Unimplemented workflows

These were not added. Each one needs a decision that is still pending.

| Workflow | Why it stays out |
|---|---|
| Critical-result target and escalation | D21-06. Acknowledgement still updates the newest active alert for the patient |
| Patient merge and unmerge | D21-03. No merge function |
| Retention, legal hold, and disposal | D21-09. No period and no deleter |
| Representative consent | D29-16. `guardian_verbal` remains a capture method |
| Allergy review before dispense | D29-17. Triage allergies stay free text |
| Pharmacy substitution | D21-07. No approval function |
| Billing reversal and payment home | D21-08. The existing tenant idempotency check was left as it is |

Encounter close, consultation draft and sign, queue reads, and document organization joins were already present and were not replaced. No migration was created.
