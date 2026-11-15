# Pharmacy dispensing

The pharmacy service still has no allergy check. Free-text triage allergies are not a blocker. D29-17 is pending.

The dispense update is `SET status = $1, version = version + 1`. That statement does not replace `prescriber_staff_id`. A different patient is `patient_not_found`. A status outside the current dispensing statuses is `invalid_status`. No substitution rule and no migration were added. D21-07 is pending.
