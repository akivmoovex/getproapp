# Laboratory and order implementation

A laboratory result is still stored with the patient on the request. If the caller supplies a different patient id, the write stops with `PATIENT_NOT_FOUND` and does not insert the result. The same check applies to a radiology report and to verification.

A request whose status is outside the stored attach list, including `verified`, is rejected before an insert. Closed results still cannot be verified, and the person who entered a result still cannot verify it. No escalation timer and no result-id column were added.
