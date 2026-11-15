# Consent and representatives

Withdrawal still updates only the row whose id, organization, patient, and `status = 'granted'` match. The patient predicate is `patient_id = $6`. The six consent types are unchanged. `research_use_of_images` is not one of them.

The consent service has no `representative_id`, no `DELETE FROM`, and no `legal_hold`. D29-16 is pending, so no representative record was added. `guardian_verbal` and `guardian_written` remain capture methods and are not that record.
