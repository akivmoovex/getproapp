# Clinical role matrix proposal

This is a proposal. It does not change the catalogue.

The stored ActiveClinic roles include organization admin, nurse, clinician, pharmacist, laboratory, radiology, billing, cashier, and finance supervisor. Organization admin is administration without clinical or finance write by default. `activeclinic.patient.merge` is assigned to nobody. `activeclinic.payment.reverse` is on the finance supervisor list and not on the cashier list.

Proposed use until an owner says otherwise:

| Role | Keep | Do not add in the next stage |
|---|---|---|
| Nurse | Triage and vitals | Signed-note edit, payment reversal |
| Clinician | Consultation draft and sign | In-place edit after sign |
| Pharmacist | Dispense against an existing prescription | An unapproved substitution policy |
| Laboratory | Result entry | Critical escalation beyond the current alert |
| Cashier | Collect and allocate | Reverse |
| Finance supervisor | Reverse | Clinical note signing |
| Organization admin | Facility and staff administration | Clinical write by default |

AC-05 remains blocked. Do not invent a church administrator to force that denial. Break-glass is not a role and is not proposed for implementation.
